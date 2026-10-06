import { updateProject } from "@/lib/projects";
import { authenticated, ownedProject } from "@/lib/api-auth";
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return authenticated(req, async (userId) => {
    const id = await ownedProject(req, userId, (await ctx.params).id);
    try {
      return Response.json(await updateProject(userId, id, await req.json()));
    } catch {
      return Response.json(
        { error: "Could not update project configuration" },
        { status: 400 },
      );
    }
  });
}
