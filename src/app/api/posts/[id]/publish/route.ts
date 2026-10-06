import { publishPost } from "@/lib/meta";
import { authenticated, ownedProject } from "@/lib/api-auth";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return authenticated(req, async (userId) => {
    const projectId = await ownedProject(req, userId);
    try {
      return Response.json(await publishPost(projectId, (await ctx.params).id));
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Publishing failed" },
        { status: 400 },
      );
    }
  });
}
