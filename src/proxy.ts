import { NextRequest, NextResponse } from "next/server";
export function proxy(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = new URL(process.env.APP_URL || "http://localhost:8200");
  if (req.headers.get("host") !== expected.host)
    return NextResponse.json(
      { error: "Invalid host. Configure APP_URL for this deployment." },
      { status: 403 },
    );
  if (origin && origin !== expected.origin)
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (req.nextUrl.pathname === "/api/mcp") return NextResponse.next();
  const password = process.env.APP_PASSWORD;
  if (
    !password &&
    !["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname)
  )
    return NextResponse.json(
      { error: "Set APP_PASSWORD before remote access" },
      { status: 503 },
    );
  if (password) {
    const expectedAuth = `Basic ${btoa(`admin:${password}`)}`;
    if (req.headers.get("authorization") !== expectedAuth)
      return new NextResponse("Sign in to PostDispatch", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="PostDispatch"' },
      });
  }
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
