import { config } from "../config";
import { logger } from "../logger";
import {
  send as vercelSend,
  handleCallback as vercelHandleCallback,
} from "@vercel/queue";
import type { QueueHandler } from "./index";

export async function send<T>(
  topic: string,
  payload: T,
  options?: { delaySeconds?: number },
) {
  // SendOptions.headers affect requests to the queue API, not delivery callbacks.
  return vercelSend(topic, payload, options);
}
export function handleCallback<T>(handler: QueueHandler<T>) {
  return async (request: Request): Promise<Response> => {
    // The queue/v2beta trigger in vercel.json makes this consumer private to
    // Vercel Queues. Use that platform boundary and the SDK's CloudEvent handling,
    // not a custom request header that the queue service does not forward.
    // Refuse execution on a standalone Next server without that boundary.
    if (config.VERCEL !== "1") {
      logger.warn("queue.callback.denied", { reason: "not_vercel_runtime" });
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    logger.debug("queue.callback.accepted");
    return vercelHandleCallback(handler)(request);
  };
}
