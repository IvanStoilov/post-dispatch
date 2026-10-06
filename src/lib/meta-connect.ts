import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { and, eq, gt, lte, like } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { verifications } from "../db/schema";
import { getAuth } from "./auth";
import { getOwnedProject, updateProject } from "./projects";
import { appOrigin } from "./uploads";
import { logger, redact } from "./logger";

export const providerSchema = z.enum(["facebook", "instagram"]);
type Provider = z.infer<typeof providerSchema>;
type Page = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
};
type Pending = {
  userId: string;
  projectId: string;
  provider: Provider;
  sessionId: string;
  phase: "authorize" | "select";
  pages?: Page[];
};
class ConnectorError extends Error {}
const lifetime = 10 * 60;
const version = () => process.env.META_API_VERSION || "v25.0";
export function connectorConfig(provider: Provider) {
  const prefix = provider === "facebook" ? "FACEBOOK" : "INSTAGRAM";
  const id = process.env[`${prefix}_APP_ID`];
  const secret = process.env[`${prefix}_APP_SECRET`];
  if (!id || !secret)
    throw new ConnectorError(
      `${prefix}_APP_ID and ${prefix}_APP_SECRET must be configured on the server.`,
    );
  return {
    id,
    secret,
    callback: `${appOrigin()}/api/meta/${provider}/callback`,
  };
}
function key() {
  if (!process.env.BETTER_AUTH_SECRET)
    throw new ConnectorError("BETTER_AUTH_SECRET is required");
  return createHash("sha256")
    .update(`postdispatch-meta:${process.env.BETTER_AUTH_SECRET}`)
    .digest();
}
function seal(value: Pending) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const content = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString(
    "base64url",
  );
}
function unseal(value: string): Pending {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString(),
  );
}
const identifier = (nonce: string) =>
  `meta-connect:${createHash("sha256").update(nonce).digest("hex")}`;
const cookieName = (provider: Provider) => `postdispatch-meta-${provider}`;
function cookie(req: Request, provider: Provider) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName(provider)}=`))
      ?.split("=")[1] || ""
  );
}
function withCookie(response: Response, provider: Provider, nonce = "") {
  response.headers.set(
    "Set-Cookie",
    `${cookieName(provider)}=${nonce}; Path=/api/meta/${provider}; HttpOnly; SameSite=Lax; Max-Age=${nonce ? lifetime : 0}${appOrigin().startsWith("https:") ? "; Secure" : ""}`,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
async function savePending(value: Pending) {
  const nonce = randomBytes(32).toString("base64url");
  // Keep abandoned flows bounded without introducing another persistence table.
  await getDb()
    .delete(verifications)
    .where(
      and(
        like(verifications.identifier, "meta-connect:%"),
        lte(verifications.expiresAt, new Date()),
      ),
    );
  await getDb()
    .insert(verifications)
    .values({
      id: randomUUID(),
      identifier: identifier(nonce),
      value: seal(value),
      expiresAt: new Date(Date.now() + lifetime * 1000),
    });
  return nonce;
}
async function identity(req: Request) {
  const session = await getAuth().api.getSession({ headers: req.headers });
  if (!session)
    throw new ConnectorError("Sign in again to connect an account.");
  return session;
}
async function pending(
  req: Request,
  provider: Provider,
  phase: Pending["phase"],
  consume: boolean,
) {
  const nonce = cookie(req, provider);
  if (!/^[\w-]{43}$/.test(nonce))
    throw new ConnectorError("Connection expired. Start again.");
  const session = await identity(req);
  const condition = and(
    eq(verifications.identifier, identifier(nonce)),
    gt(verifications.expiresAt, new Date()),
  );
  const [row] = await getDb().select().from(verifications).where(condition);
  if (!row) throw new ConnectorError("Connection expired. Start again.");
  const value = unseal(row.value);
  if (
    value.provider !== provider ||
    value.phase !== phase ||
    value.userId !== session.user.id ||
    value.sessionId !== session.session.id
  )
    throw new ConnectorError("Connection does not belong to this session.");
  await getOwnedProject(value.userId, value.projectId);
  if (consume) {
    const [claimed] = await getDb()
      .delete(verifications)
      .where(and(eq(verifications.id, row.id), condition))
      .returning({ id: verifications.id });
    if (!claimed)
      throw new ConnectorError("Connection already completed. Start again.");
  }
  return value;
}
function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== appOrigin())
    throw new ConnectorError("Invalid origin");
}
function redirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: new URL(path, appOrigin()).toString() },
  });
}
// Dedicated OAuth requests also use redacted Winston logs. Codes and client
// secrets never appear in log metadata or errors returned to the browser.
async function meta(
  url: string,
  init: RequestInit = {},
  secrets: string[] = [],
) {
  const requestId = randomUUID();
  const started = performance.now();
  const debug = (event: string, values: Record<string, unknown>) =>
    logger.debug(
      event,
      redact(
        { requestId, method: init.method || "GET", url, ...values },
        secrets,
      ) as Record<string, unknown>,
    );
  debug("meta.request", {
    fields:
      init.body instanceof URLSearchParams
        ? Object.fromEntries(init.body)
        : Object.fromEntries(new URL(url).searchParams),
  });
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const body = await response.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      debug("meta.response", { status: response.status, body });
      throw new ConnectorError("Meta returned an invalid response.");
    }
    debug("meta.response", {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      body: data,
    });
    if (!response.ok || data.error)
      throw new ConnectorError(
        "Meta rejected the connection. Check permissions and try again.",
      );
    return data;
  } catch (error) {
    debug("meta.failure", {
      durationMs: Math.round(performance.now() - started),
      error,
    });
    throw new ConnectorError(
      "Could not connect to Meta. Check permissions and try again.",
    );
  }
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
async function facebookPages(code: string) {
  const config = connectorConfig("facebook");
  const tokenUrl = new URL(
    `https://graph.facebook.com/${version()}/oauth/access_token`,
  );
  tokenUrl.search = new URLSearchParams({
    client_id: config.id,
    client_secret: config.secret,
    redirect_uri: config.callback,
    code,
  }).toString();
  const short = await meta(tokenUrl.toString(), {}, [code, config.secret]);
  const token = z.string().min(1).parse(short.access_token);
  tokenUrl.search = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: config.id,
    client_secret: config.secret,
    fb_exchange_token: token,
  }).toString();
  const long = await meta(tokenUrl.toString(), {}, [token, config.secret]);
  const access = z.string().min(1).parse(long.access_token);
  const permissions = await meta(
    `https://graph.facebook.com/${version()}/me/permissions`,
    { headers: bearer(access) },
    [access],
  );
  for (const permission of [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
  ])
    if (
      !permissions.data?.some(
        (item: { permission: string; status: string }) =>
          item.permission === permission && item.status === "granted",
      )
    )
      throw new ConnectorError(
        "Grant Page listing, reading, and publishing permissions to connect Facebook.",
      );
  const pages: Page[] = [];
  let next: string | undefined =
    `https://graph.facebook.com/${version()}/me/accounts?fields=id,name,access_token,tasks&limit=100`;
  for (let i = 0; next && i < 20; i++) {
    const url = new URL(next);
    if (
      url.origin !== "https://graph.facebook.com" ||
      url.pathname !== `/${version()}/me/accounts`
    )
      throw new ConnectorError("Invalid Meta pagination response.");
    const data = await meta(next, { headers: bearer(access) }, [access]);
    for (const page of z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          access_token: z.string().min(1),
          tasks: z.array(z.string()).optional(),
        }),
      )
      .parse(data.data)) {
      if (
        page.tasks?.some((task) =>
          [
            "CREATE_CONTENT",
            "MANAGE",
            "PROFILE_PLUS_CREATE_CONTENT",
            "PROFILE_PLUS_FULL_CONTROL",
          ].includes(task),
        )
      )
        pages.push(page);
    }
    next = data.paging?.next;
  }
  if (next)
    throw new ConnectorError(
      "Too many Pages. Limit the Pages granted to this app and reconnect.",
    );
  if (!pages.length)
    throw new ConnectorError(
      "No Pages with publishing access were granted. Check your Page access and reconnect.",
    );
  return pages;
}
async function instagramAccount(code: string) {
  const config = connectorConfig("instagram");
  const short = await meta(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.id,
        client_secret: config.secret,
        grant_type: "authorization_code",
        redirect_uri: config.callback,
        code,
      }),
    },
    [code, config.secret],
  );
  const token = z.string().min(1).parse(short.access_token);
  const permissions: string[] =
    typeof short.permissions === "string"
      ? short.permissions.split(",")
      : short.permissions || [];
  for (const scope of [
    "instagram_business_basic",
    "instagram_business_content_publish",
  ])
    if (!permissions.includes(scope))
      throw new ConnectorError(
        "Grant Instagram profile and publishing permissions, then reconnect.",
      );
  const url = new URL("https://graph.instagram.com/access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.secret,
    access_token: token,
  }).toString();
  const long = await meta(url.toString(), {}, [token, config.secret]);
  const access = z.string().min(1).parse(long.access_token);
  const profile = await meta(
    `https://graph.instagram.com/${version()}/me?fields=user_id,username`,
    { headers: bearer(access) },
    [access],
  );
  return {
    id: z
      .union([z.string(), z.number()])
      .transform(String)
      .parse(profile.user_id),
    token: access,
  };
}
export async function startConnection(req: Request, provider: Provider) {
  sameOrigin(req);
  const session = await identity(req);
  const { projectId } = z
    .object({ projectId: z.uuid() })
    .parse(await req.json());
  await getOwnedProject(session.user.id, projectId);
  const config = connectorConfig(provider);
  const state = await savePending({
    provider,
    projectId,
    userId: session.user.id,
    sessionId: session.session.id,
    phase: "authorize",
  });
  const url = new URL(
    provider === "facebook"
      ? `https://www.facebook.com/${version()}/dialog/oauth`
      : "https://www.instagram.com/oauth/authorize",
  );
  url.search = new URLSearchParams({
    client_id: config.id,
    redirect_uri: config.callback,
    response_type: "code",
    state,
    scope:
      provider === "facebook"
        ? "pages_show_list,pages_read_engagement,pages_manage_posts"
        : "instagram_business_basic,instagram_business_content_publish",
    ...(provider === "facebook"
      ? { auth_type: "rerequest" }
      : { enable_fb_login: "0" }),
  }).toString();
  return withCookie(Response.json({ url: url.toString() }), provider, state);
}
export async function callbackConnection(req: Request, provider: Provider) {
  const url = new URL(req.url);
  if (
    !cookie(req, provider) ||
    url.searchParams.get("state") !== cookie(req, provider)
  )
    throw new ConnectorError(
      "Invalid OAuth state. Start the connection again.",
    );
  const value = await pending(req, provider, "authorize", true);
  if (url.searchParams.has("error"))
    return withCookie(
      redirect(`/?projectId=${value.projectId}&connection=cancelled`),
      provider,
    );
  const code = z.string().min(1).max(4096).parse(url.searchParams.get("code"));
  if (provider === "facebook") {
    const pages = await facebookPages(code);
    const nonce = await savePending({ ...value, phase: "select", pages });
    return withCookie(redirect("/connections/facebook"), provider, nonce);
  }
  const account = await instagramAccount(code);
  const project = await getOwnedProject(value.userId, value.projectId);
  await updateProject(value.userId, value.projectId, {
    name: project.name,
    instagramAccountId: account.id,
    instagramAccessToken: account.token,
    instagramApiHost: "graph.instagram.com",
  });
  return withCookie(
    redirect(`/?projectId=${value.projectId}&connection=instagram`),
    provider,
  );
}
export async function availablePages(req: Request) {
  const value = await pending(req, "facebook", "select", false);
  const project = await getOwnedProject(value.userId, value.projectId);
  return Response.json(
    {
      projectName: project.name,
      pages: value.pages!.map(({ id, name }) => ({ id, name })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function selectPage(req: Request) {
  sameOrigin(req);
  const { pageId } = z
    .object({ pageId: z.string().min(1).max(100) })
    .parse(await req.json());
  const value = await pending(req, "facebook", "select", false);
  const page = value.pages?.find((item) => item.id === pageId);
  if (!page)
    throw new ConnectorError("Select a Page from the authorized list.");
  await pending(req, "facebook", "select", true);
  const project = await getOwnedProject(value.userId, value.projectId);
  await updateProject(value.userId, value.projectId, {
    name: project.name,
    facebookPageId: page.id,
    facebookPageToken: page.access_token,
  });
  return withCookie(
    Response.json({
      url: `/?projectId=${value.projectId}&connection=facebook`,
    }),
    "facebook",
  );
}
export function connectionError(
  provider: Provider,
  error: unknown,
  callback = false,
) {
  const message =
    error instanceof ConnectorError
      ? error.message
      : "Connection failed. Start again.";
  if (callback) {
    logger.debug("meta.connection.failure", { provider, reason: message });
    // Do not copy provider error descriptions, codes or callback URLs into UI.
    return withCookie(redirect("/connections/error"), provider);
  }
  return Response.json(
    { error: message },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
