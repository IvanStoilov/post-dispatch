import { loggedRequest } from "@/lib/logger";
import { internalRequestAuthorized } from "@/lib/internal-auth";
import { recoverPublishingJobs } from "@/lib/publish-jobs";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  return loggedRequest(request, "/api/cron/publishing", async () => {
    const secret = process.env.CRON_SECRET;
    if (
      !internalRequestAuthorized(
        request,
        "authorization",
        secret ? `Bearer ${secret}` : undefined,
      )
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ dispatched: await recoverPublishingJobs(100) });
  });
}
