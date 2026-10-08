import { loggedRequest } from "@/lib/logger";
import { authenticated } from "@/lib/api-auth";
import { listOAuthConnections } from "@/lib/oauth";
import { accountTokenConfigured } from "@/lib/mcp-account";
export async function GET(req: Request) {
  return loggedRequest(req, "/api/mcp-settings", async () => {
    return authenticated(req, async (userId) =>
      Response.json(
        {
          configured: await accountTokenConfigured(userId),
          grants: await listOAuthConnections(userId),
        },
        { headers: { "Cache-Control": "no-store" } },
      ),
    );
  });
}
