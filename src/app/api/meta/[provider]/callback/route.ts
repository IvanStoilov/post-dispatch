import { loggedRequest, logger } from "@/lib/logger";
import {
  callbackConnection,
  connectionError,
  providerSchema,
} from "@/lib/meta-connect";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  return loggedRequest(req, "/api/meta/[provider]/callback", async () => {
    const provider = providerSchema.safeParse((await ctx.params).provider);
    if (!provider.success)
      return Response.json({ error: "Unknown provider" }, { status: 404 });
    try {
      return await callbackConnection(req, provider.data);
    } catch (error) {
      logger.warn("http.handler.rejected", { error: error });

      return connectionError(provider.data, error, true);
    }
  });
}
