import {
  callbackConnection,
  connectionError,
  providerSchema,
} from "@/lib/connector-connect";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  const provider = providerSchema.safeParse((await ctx.params).provider);
  if (!provider.success)
    return Response.json({ error: "Unknown provider" }, { status: 404 });
  try {
    return await callbackConnection(req, provider.data);
  } catch (error) {
    return connectionError(provider.data, error, true);
  }
}
