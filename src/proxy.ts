import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
export function proxy(req: NextRequest) {
  const expected = new URL(process.env.APP_URL || "http://localhost:8200");
  const origin = req.headers.get("origin");
  if (req.headers.get("host") !== expected.host)
    return NextResponse.json(
      { error: "Invalid host. Configure APP_URL for this deployment." },
      { status: 403 },
    );
  if (origin && origin !== expected.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const path = req.nextUrl.pathname;
  if (
    path.startsWith("/api/auth/") ||
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
