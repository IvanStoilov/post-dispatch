import {
  send as vercelSend,
  handleCallback as vercelHandleCallback,
} from "@vercel/queue";
import { internalRequestAuthorized } from "../internal-auth";
import type { QueueHandler } from "./index";

// Provider-specific authentication and APIs stay inside this adapter.
// v2 push delivery includes the payload, so authenticate BEFORE the SDK handler
// runs; checking its acknowledgement receipt after business effects is too late.
export async function send<T>(
  topic: string,
  payload: T,
  options?: { delaySeconds?: number },
) {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    throw new Error("Configure CRON_SECRET for queue delivery and recovery");
  return vercelSend(topic, payload, {
    ...options,
    headers: { "x-postdispatch-queue-secret": secret },
  });
}
export function handleCallback<T>(handler: QueueHandler<T>) {
  return async (request: Request): Promise<Response> => {
    if (
      !internalRequestAuthorized(
        request,
        "x-postdispatch-queue-secret",
        process.env.CRON_SECRET,
      )
    )
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    return vercelHandleCallback(handler)(request);
  };
}
