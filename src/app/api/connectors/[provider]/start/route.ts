import { loggedRequest } from "@/lib/logger";
import { handleConnection, startConnection } from "@/server/connections";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  return loggedRequest(req, "/api/connectors/[provider]/start", async () =>
    handleConnection((await ctx.params).provider, (provider) =>
      startConnection(req, provider),
    ),
  );
}
