import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../config";
import { logger, redact } from "../logger";
import { appOrigin } from "../origins";
import type { Platform } from "../types";
import { linkedinConfig } from "./linkedin";

// OAuth with Meta (Facebook Login for Pages, Instagram Login) for the
// connect flow, plus each provider's app credentials and callback URL.

// A refusal the user can act on (missing permission, no Pages, Meta
// unavailable). Its message is safe to show; it never contains secrets.
export class ConnectorAuthError extends Error {}

export const metaApiVersion = () => config.META_API_VERSION;

export type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
};

export function connectorConfig(provider: Platform) {
  if (provider === "linkedin") {
    let config;
    try {
      config = linkedinConfig();
    } catch (error) {
      throw new ConnectorAuthError(
        error instanceof Error
          ? error.message
          : "Configure LinkedIn credentials.",
      );
    }
    return {
      ...config,
      callback: `${appOrigin()}/api/connectors/linkedin/callback`,
    };
  }
  const prefix = provider === "facebook" ? "FACEBOOK" : "INSTAGRAM";
  const id =
    provider === "facebook" ? config.FACEBOOK_APP_ID : config.INSTAGRAM_APP_ID;
  const secret =
    provider === "facebook"
      ? config.FACEBOOK_APP_SECRET
      : config.INSTAGRAM_APP_SECRET;
  if (!id || !secret) {
    throw new ConnectorAuthError(
      `${prefix}_APP_ID and ${prefix}_APP_SECRET must be configured on the server.`,
    );
  }
  return {
    id,
    secret,
    callback: `${appOrigin()}/api/meta/${provider}/callback`,
  };
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
      throw new ConnectorAuthError("Meta returned an invalid response.");
    }
    debug("meta.response", {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      body: data,
    });
    if (!response.ok || data.error) {
      throw new ConnectorAuthError(
        "Meta rejected the connection. Check permissions and try again.",
      );
    }
    return data;
  } catch (error) {
    debug("meta.failure", {
      durationMs: Math.round(performance.now() - started),
      error,
    });
    throw new ConnectorAuthError(
      "Could not connect to Meta. Check permissions and try again.",
    );
  }
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export async function facebookPages(code: string) {
  const config = connectorConfig("facebook");
  const tokenUrl = new URL(
    `https://graph.facebook.com/${metaApiVersion()}/oauth/access_token`,
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
    `https://graph.facebook.com/${metaApiVersion()}/me/permissions`,
    { headers: bearer(access) },
    [access],
  );
  for (const permission of [
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_posts",
  ]) {
    if (
      !permissions.data?.some(
        (item: { permission: string; status: string }) =>
          item.permission === permission && item.status === "granted",
      )
    ) {
      throw new ConnectorAuthError(
        "Grant Page listing, reading, and publishing permissions to connect Facebook.",
      );
    }
  }
  const pages: MetaPage[] = [];
  let next: string | undefined =
    `https://graph.facebook.com/${metaApiVersion()}/me/accounts?fields=id,name,access_token,tasks&limit=100`;
  for (let i = 0; next && i < 20; i++) {
    const url = new URL(next);
    if (
      url.origin !== "https://graph.facebook.com" ||
      url.pathname !== `/${metaApiVersion()}/me/accounts`
    ) {
      throw new ConnectorAuthError("Invalid Meta pagination response.");
    }
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
      ) {
        pages.push(page);
      }
    }
    next = data.paging?.next;
  }
  if (next) {
    throw new ConnectorAuthError(
      "Too many Pages. Limit the Pages granted to this app and reconnect.",
    );
  }
  if (!pages.length) {
    throw new ConnectorAuthError(
      "No Pages with publishing access were granted. Check your Page access and reconnect.",
    );
  }
  return pages;
}
export async function instagramAccount(code: string) {
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
  ]) {
    if (!permissions.includes(scope)) {
      throw new ConnectorAuthError(
        "Grant Instagram profile and publishing permissions, then reconnect.",
      );
    }
  }
  const url = new URL("https://graph.instagram.com/access_token");
  url.search = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: config.secret,
    access_token: token,
  }).toString();
  const long = await meta(url.toString(), {}, [token, config.secret]);
  const access = z.string().min(1).parse(long.access_token);
  const profile = await meta(
    `https://graph.instagram.com/${metaApiVersion()}/me?fields=user_id,username`,
    { headers: bearer(access) },
    [access],
  );
  return {
    name: z.string().trim().min(1).parse(profile.username),
    id: z
      .union([z.string(), z.number()])
      .transform(String)
      .parse(profile.user_id),
    token: access,
  };
}
