import { loggedRequest, logger } from "@/lib/logger";
import {
  startConnection,
  connectionError,
  providerSchema,
} from "@/lib/connector-connect";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  return loggedRequest(req, "/api/connectors/[provider]/start", async () => {
    const provider = providerSchema.safeParse((await ctx.params).provider);
    if (!provider.success)
      return Response.json({ error: "Unknown provider" }, { status: 404 });
    try {
      return await startConnection(req, provider.data);
    } catch (error) {
      logger.warn("http.handler.rejected", { error: error });

      return connectionError(provider.data, error);
    }
  });
}
