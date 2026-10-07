import { authenticated } from "@/lib/api-auth";
import { rotateAccountToken } from "@/lib/mcp-account";
export async function POST(req: Request) {
  return authenticated(req, async (userId) =>
    Response.json(await rotateAccountToken(userId), {
      headers: { "Cache-Control": "no-store" },
    }),
  );
}
