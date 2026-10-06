import { protectedResourceMetadata } from "@/lib/oauth";
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return protectedResourceMetadata((await ctx.params).projectId);
}
