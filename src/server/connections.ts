import { z } from "zod";
import { connectionsService, type SessionActor } from "@/domain/connections";
import { UserFacingError } from "@/domain/shared/errors";
import { getAuth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { appOrigin, appPageUrl } from "@/lib/origins";
import { platforms, type Platform } from "@/shared/platforms";

// HTTP side of the connect flow (/api/meta/* and /api/connectors/*): the
// session, the same-origin check and the cookie holding the flow's nonce.
// The cookie is scoped to the provider's routes, so these stay plain routes
// rather than /api/v1. The flow itself is src/domain/connections.

export const providerSchema = z.enum(platforms);

const LIFETIME_SECONDS = 10 * 60;
const routeBase = (provider: Platform) =>
  provider === "linkedin" ? "/api/connectors" : "/api/meta";
const cookieName = (provider: Platform) => `postdispatch-meta-${provider}`;

function flowCookie(req: Request, provider: Platform) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName(provider)}=`))
      ?.split("=")[1] || ""
  );
}

// Sets the flow's cookie, or clears it without a nonce.
function withCookie(response: Response, provider: Platform, nonce = "") {
  response.headers.set(
    "Set-Cookie",
    `${cookieName(provider)}=${nonce}; Path=${routeBase(provider)}/${provider}; HttpOnly; SameSite=Lax; Max-Age=${nonce ? LIFETIME_SECONDS : 0}${appOrigin().startsWith("https:") ? "; Secure" : ""}`,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function redirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: { Location: appPageUrl(path) },
  });
}

async function sessionActor(req: Request): Promise<SessionActor> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  if (!session) {
    throw new UserFacingError("Sign in again to connect an account.", 401);
  }
  return { userId: session.user.id, sessionId: session.session.id };
}

function sameOrigin(req: Request) {
  if (req.headers.get("origin") !== appOrigin()) {
    throw new UserFacingError("Invalid origin", 403);
  }
}

async function body<T>(req: Request, schema: z.ZodType<T>, message: string) {
  const parsed = schema.safeParse(await req.json().catch(() => undefined));
  if (!parsed.success) {
    throw new UserFacingError(message, 400);
  }
  return parsed.data;
}

const selectable = (provider: Platform) => {
  if (provider === "instagram") {
    throw new UserFacingError("Instagram has no account to choose.", 404);
  }
  return provider;
};

// POST …/{provider}/start: returns the provider's authorization URL.
export async function startConnection(req: Request, provider: Platform) {
  sameOrigin(req);
  const actor = await sessionActor(req);
  const { projectId } = await body(
    req,
    z.object({ projectId: z.uuid() }),
    "Choose a project to connect.",
  );
  const { url, nonce } = await connectionsService.start(actor, {
    projectId,
    provider,
  });
  return withCookie(Response.json({ url }), provider, nonce);
}

// GET …/{provider}/callback: the provider sends the user back here.
export async function callbackConnection(req: Request, provider: Platform) {
  const params = new URL(req.url).searchParams;
  const result = await connectionsService.complete(await sessionActor(req), {
    provider,
    nonce: flowCookie(req, provider),
    state: params.get("state"),
    code: params.get("code"),
    error: params.get("error"),
  });
  const page = `/projects/${result.projectId}/connections`;
  if (result.outcome === "select") {
    return withCookie(redirect(`${page}/${provider}`), provider, result.nonce);
  }
  return withCookie(
    redirect(
      `${page}?connection=${result.outcome === "cancelled" ? "cancelled" : provider}`,
    ),
    provider,
  );
}

// GET the accounts the user can choose from (Facebook Pages, LinkedIn
// profile and organizations), without tokens.
export async function listAccounts(req: Request, provider: Platform) {
  const accounts = await connectionsService.listAccounts(
    await sessionActor(req),
    { provider: selectable(provider), nonce: flowCookie(req, provider) },
  );
  return Response.json(accounts, { headers: { "Cache-Control": "no-store" } });
}

// POST the chosen account; returns where to go next.
export async function selectAccount(req: Request, provider: Platform) {
  sameOrigin(req);
  const actor = await sessionActor(req);
  const { pageId } = await body(
    req,
    z.object({ pageId: z.string().min(1).max(200) }),
    "Choose an account to connect.",
  );
  const { projectId } = await connectionsService.selectAccount(actor, {
    provider: selectable(provider),
    nonce: flowCookie(req, provider),
    accountId: pageId,
  });
  return withCookie(
    Response.json({
      url: appPageUrl(
        `/projects/${projectId}/connections?connection=${provider}`,
      ),
    }),
    provider,
  );
}

// The one place connect-flow errors become responses. Callbacks redirect to
// a generic page: provider error details and callback URLs never reach the
// UI.
export function connectionError(
  provider: Platform,
  error: unknown,
  callback = false,
) {
  const known = error instanceof UserFacingError;
  const message = known ? error.message : "Connection failed. Start again.";
  if (known) {
    logger.warn("connection.rejected", { provider, reason: message });
  } else {
    logger.error("connection.failed", { provider, error });
  }
  if (callback) {
    return withCookie(redirect("/connections/error"), provider);
  }
  return Response.json(
    { error: message },
    {
      status: known ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

// Runs a step for a route and turns failures into responses.
export async function handleConnection(
  provider: string,
  step: (provider: Platform) => Promise<Response>,
  { callback = false } = {},
) {
  const parsed = providerSchema.safeParse(provider);
  if (!parsed.success) {
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  }
  try {
    return await step(parsed.data);
  } catch (error) {
    return connectionError(parsed.data, error, callback);
  }
}
