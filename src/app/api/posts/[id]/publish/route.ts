import { after } from "next/server";
import { enqueuePublication, dispatchPublishingJob } from "@/lib/publish-jobs";
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
      const { post, jobIds } = await enqueuePublication(
        projectId,
        (await ctx.params).id,
      );
      after(async () => {
        for (const id of jobIds) await dispatchPublishingJob(id);
      });
      return Response.json(post, { status: 202 });
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Publishing failed" },
        { status: 400 },
      );
    }
  });
}
