import { NextRequest, NextResponse } from "next/server";
import { publicPages, publicAssets } from "@/lib/public-routes";
import { getSessionCookie } from "better-auth/cookies";
export function proxy(req: NextRequest) {
  const expected = new URL(process.env.APP_URL || "http://localhost:8200");
  const origin = req.headers.get("origin");
  if (req.headers.get("host") !== expected.host)
    return NextResponse.json(
      { error: "Invalid host. Configure APP_URL for this deployment." },
      { status: 403 },
    );
  const oauthProtocol = [
    "/api/auth/oauth2/token",
    "/api/auth/oauth2/register",
    "/api/auth/oauth2/revoke",
    "/api/auth/oauth2/introspect",
  ].includes(req.nextUrl.pathname);
  if (origin && origin !== expected.origin && !oauthProtocol)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const path = req.nextUrl.pathname;
  if (
    publicPages.some((p) => p === path) ||
    publicAssets.some((p) => path === p) ||
    path.startsWith("/api/auth/") ||
    path.startsWith("/.well-known/") ||
    path === "/signin" ||
    path === "/signup" ||
    path === "/api/mcp" ||
    path.startsWith("/api/mcp/")
  )
    return NextResponse.next();
  if (!getSessionCookie(req)) {
    if (path.startsWith("/api/"))
      return NextResponse.json(
        { error: "Sign in to continue" },
        { status: 401 },
      );
    return NextResponse.redirect(new URL("/signin", req.url));
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
