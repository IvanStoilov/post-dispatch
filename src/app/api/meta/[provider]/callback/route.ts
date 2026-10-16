import { loggedRequest } from "@/lib/logger";
import { callbackConnection, handleConnection } from "@/server/connections";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  return loggedRequest(req, "/api/meta/[provider]/callback", async () =>
    handleConnection(
      (await ctx.params).provider,
      (provider) => callbackConnection(req, provider),
      { callback: true },
    ),
  );
}
