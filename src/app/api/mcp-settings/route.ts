import { authenticated } from "@/lib/api-auth";
import { listOAuthConnections } from "@/lib/oauth";
import { accountTokenConfigured } from "@/lib/mcp-account";
export async function GET(req: Request) {
  return authenticated(req, async (userId) =>
    Response.json(
      {
        configured: await accountTokenConfigured(userId),
        grants: await listOAuthConnections(userId),
      },
      { headers: { "Cache-Control": "no-store" } },
    ),
  );
}
