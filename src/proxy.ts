import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { config as appConfig } from "./lib/config";
import { appOrigin, publicOrigin, isCleanAppHost } from "./lib/origins";
import { applicationPath } from "./lib/route-paths";
import { logger } from "@/lib/logger";
import { publicPages, publicAssets } from "@/lib/public-routes";

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const host = req.headers.get("host");
  const application = new URL(appOrigin());
  const marketing = new URL(appConfig.PUBLIC_URL);
  const deployment = new URL(appConfig.APP_URL);
  const cleanHost = isCleanAppHost(host);
  const publicHost =
    host === marketing.host && marketing.host !== application.host;
  const allowedHosts = new Set([
    application.host,
    marketing.host,
    deployment.host,
    new URL(appConfig.APPLICATION_URL).host,
  ]);
  if (!host || !allowedHosts.has(host)) {
    logger.warn("http.proxy.denied", {
      reason: "invalid_host",
      method: req.method,
    });
    return NextResponse.json(
      { error: "Invalid host. Configure APP_URL for this deployment." },
      { status: 403 },
    );
  }
  // Queue/cron handlers authenticate independently; Vercel uses the deployment host.
  if (
    !publicHost &&
    ["/api/queues/publishing", "/api/cron/publishing"].includes(path)
  ) {
    return NextResponse.next();
  }

  const expectedOrigin = publicHost
    ? marketing.origin
    : cleanHost
      ? appConfig.APPLICATION_URL
      : host === application.host
        ? application.origin
        : deployment.origin;
  const oauthProtocol = [
    "/api/auth/oauth2/token",
    "/api/auth/oauth2/register",
    "/api/auth/oauth2/revoke",
    "/api/auth/oauth2/introspect",
  ].includes(path);
  const origin = req.headers.get("origin");
  if (origin && origin !== expectedOrigin && !oauthProtocol) {
    logger.warn("http.proxy.denied", {
      reason: "invalid_origin",
      method: req.method,
    });
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const api = path === "/api" || path.startsWith("/api/");
  const protocol = path.startsWith("/.well-known/");
  const asset = publicAssets.some((p) => p === path);
  const prefixed = path === "/app" || path.startsWith("/app/");
  const publicPage = publicPages.some((p) => p === path);
  const redirect = (pathname: string, targetOrigin: string) => {
    const target = new URL(pathname, targetOrigin);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target);
  };

  if (publicHost) {
    if (api) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (
      prefixed ||
      protocol ||
      ["/signin", "/signup", "/forgot-password", "/reset-password"].includes(
        path,
      )
    ) {
      if (!["GET", "HEAD"].includes(req.method)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return redirect(
        prefixed ? path.slice(4) || "/" : path,
        appConfig.APPLICATION_URL,
      );
    }
    return NextResponse.next();
  }
  if (cleanHost && prefixed) {
    return redirect(path.slice(4) || "/", appConfig.APPLICATION_URL);
  }
  if (cleanHost && publicPage && path !== "/") {
    return redirect(path, publicOrigin());
  }
  if (asset) {
    return NextResponse.next();
  }

  // Production aliases canonicalize browser app pages; previews remain self-contained.
  if (!cleanHost && prefixed && appConfig.VERCEL_ENV === "production") {
    return redirect(path.slice(4) || "/", application.origin);
  }

  const applicationPage = (cleanHost && !api && !protocol) || prefixed;
  const pagePath = cleanHost ? path : path.slice(4) || "/";
  const openPage = [
    "/signin",
    "/signup",
    "/forgot-password",
    "/reset-password",
  ].includes(pagePath);
  const openApi =
    path.startsWith("/api/auth/") ||
    path === "/api/mcp" ||
    path.startsWith("/api/mcp/");
  if (
    ((applicationPage && !openPage) || (api && !openApi)) &&
    !getSessionCookie(req)
  ) {
    logger.debug("http.proxy.signin.required", {
      method: req.method,
      isApi: api,
    });
    if (api) {
      return NextResponse.json(
        { error: "Sign in to continue" },
        { status: 401 },
      );
    }
    return redirect(applicationPath("/signin", cleanHost), expectedOrigin);
  }
  if (cleanHost && applicationPage) {
    const target = req.nextUrl.clone();
    target.pathname = applicationPath(path);
    return appResponse(NextResponse.rewrite(target));
  }
  if (applicationPage || api || protocol) {
    return appResponse(NextResponse.next());
  }
  return NextResponse.next();
}
function appResponse(response: NextResponse) {
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
