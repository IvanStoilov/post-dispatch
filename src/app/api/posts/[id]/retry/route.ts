import { after } from "next/server";
import {
  retryFailedPublication,
  dispatchPublishingJob,
} from "@/lib/publish-jobs";
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
      const ids = await retryFailedPublication(
        projectId,
        (await ctx.params).id,
      );
      after(async () => {
        for (const id of ids) await dispatchPublishingJob(id);
      });
      return Response.json({ queued: true }, { status: 202 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Retry failed" },
        { status: 400 },
      );
    }
  });
}
