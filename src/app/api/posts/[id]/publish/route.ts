import { publishPost } from "@/lib/meta";
export const runtime = "nodejs";
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json(await publishPost((await ctx.params).id));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Publishing failed" },
      { status: 400 },
    );
  }
}
