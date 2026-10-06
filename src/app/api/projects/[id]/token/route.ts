import { rotateProjectToken } from "@/lib/projects";
import { authenticated, ownedProject } from "@/lib/api-auth";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return authenticated(req, async (userId) =>
    Response.json(
      await rotateProjectToken(
        userId,
        await ownedProject(req, userId, (await ctx.params).id),
      ),
    ),
  );
}
