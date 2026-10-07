import { handleAccountMcp } from "@/lib/mcp";
import { oauthChallenge } from "@/lib/oauth";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = handleAccountMcp;
export async function GET(req: Request) {
  if (!req.headers.get("authorization")) return oauthChallenge();
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
