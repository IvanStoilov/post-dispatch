import { authenticated, ownedProject } from "@/lib/api-auth";
import { disconnectConnector } from "@/lib/projects";
import { providerSchema } from "@/lib/connector-connect";
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; provider: string }> },
) {
  return authenticated(req, async (userId) => {
    const { id, provider } = await ctx.params;
    const parsed = providerSchema.safeParse(provider);
    if (!parsed.success)
      return Response.json({ error: "Unknown provider" }, { status: 404 });
    const projectId = await ownedProject(req, userId, id);
    await disconnectConnector(userId, projectId, parsed.data);
    return Response.json({ disconnected: true });
  });
}
