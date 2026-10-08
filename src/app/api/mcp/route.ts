import { loggedRequest } from "@/lib/logger";
import { handleAccountMcp } from "@/lib/mcp";
import { oauthChallenge } from "@/lib/oauth";
export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = (req: Request) =>
  loggedRequest(req, "/api/mcp", () => handleAccountMcp(req));
export async function GET(req: Request) {
  return loggedRequest(req, "/api/mcp", async () => {
    if (!req.headers.get("authorization")) return oauthChallenge();
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  });
}
