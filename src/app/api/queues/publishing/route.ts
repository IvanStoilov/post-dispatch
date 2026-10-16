import { loggedRequest } from "@/lib/logger";
import { publishingQueue } from "@/domain/publishing/system";
export const runtime = "nodejs";
export const maxDuration = 300;
const callback = publishingQueue.handleCallback();
export const POST = (req: Request) =>
  loggedRequest(req, "/api/queues/publishing", () => callback(req));
