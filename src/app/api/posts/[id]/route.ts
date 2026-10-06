import { editPost, deletePost } from "@/lib/store";
import { authenticated, ownedProject } from "@/lib/api-auth";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(req: Request, ctx: Context) {
  return authenticated(req, async (userId) => {
    const projectId = await ownedProject(req, userId);
    try {
      return Response.json(
        await editPost(projectId, (await ctx.params).id, await req.json()),
      );
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Update failed" },
        { status: 400 },
      );
    }
  });
}
export async function DELETE(req: Request, ctx: Context) {
  return authenticated(req, async (userId) => {
    const projectId = await ownedProject(req, userId);
    try {
      await deletePost(projectId, (await ctx.params).id);
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Delete failed" },
        { status: 400 },
      );
    }
  });
}
