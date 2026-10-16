import { loggedRequest } from "@/lib/logger";
import { publishingSystemService } from "@/domain/publishing";

export const runtime = "nodejs";
export const maxDuration = 300;
const callback = publishingSystemService.queue.handleCallback();
export const POST = (req: Request) =>
  loggedRequest(req, "/api/queues/publishing", () => callback(req));
