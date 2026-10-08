import { randomUUID } from "node:crypto";

export type QueueDriver = "local" | "vercel";
export type QueueHandler<T> = (payload: T) => Promise<void>;

export function queueDriver(): QueueDriver {
  const driver =
    process.env.QUEUE_DRIVER ||
    (process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
      ? "vercel"
      : "local");
  if (driver !== "local" && driver !== "vercel") {
    throw new Error("QUEUE_DRIVER must be local or vercel");
  }
  if (
    driver === "local" &&
    (process.env.NODE_ENV === "production" || process.env.VERCEL === "1")
  ) {
    throw new Error("The local queue driver is only available in development");
  }
  return driver;
}

/** Keep the same handler for inline local execution and hosted delivery. */
export function createQueue<T>(topic: string, handler: QueueHandler<T>) {
  if (!topic.trim()) throw new Error("Queue topic is required");

  async function send(
    payload: T,
    options?: { delaySeconds?: number },
  ): Promise<{ messageId: string | null }> {
    // Match the JSON boundary of hosted messaging. Local handlers cannot mutate
    // the caller's payload or receive objects that cannot cross that boundary.
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) {
      throw new Error("Queue payload must be JSON serializable");
    }
    const message = JSON.parse(serialized) as T;
    if (queueDriver() === "local") {
      if (options?.delaySeconds && options.delaySeconds > 0)
        throw new Error(
          "Local delayed jobs must be scheduled in Postgres and run by jobs:work",
        );
      const messageId = `local-${randomUUID()}`;
      await handler(message);
      return { messageId };
    }
    const provider = await import("./vercel");
    return provider.send(topic, message, options);
  }

  function handleCallback() {
    return async (request: Request): Promise<Response> => {
      if (queueDriver() === "local") {
        // Local send invokes the handler directly; don't expose an unauthenticated
        // HTTP endpoint that can execute work in development.
        return Response.json(
          { error: "Local queue delivery uses send(), not HTTP callbacks" },
          { status: 503 },
        );
      }
      const provider = await import("./vercel");
      return provider.handleCallback(handler)(request);
    };
  }

  return { send, handleCallback };
}
