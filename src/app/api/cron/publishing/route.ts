import { config } from "../../../../lib/config";
import { loggedRequest } from "@/lib/logger";
import { internalRequestAuthorized } from "@/lib/internal-auth";
import { publishingSystemService } from "@/domain/publishing";
import { recoverAccountMediaCleanup } from "@/lib/account-deletion";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  return loggedRequest(request, "/api/cron/publishing", async () => {
    const secret = config.CRON_SECRET;
    if (
      !internalRequestAuthorized(
        request,
        "authorization",
        secret ? `Bearer ${secret}` : undefined,
      )
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    const mediaCleanup = await recoverAccountMediaCleanup();
    return Response.json({
      dispatched: await publishingSystemService.recoverJobs(100),
      mediaCleanup,
    });
  });
}
