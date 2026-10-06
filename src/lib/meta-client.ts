import { randomUUID } from "node:crypto";
import { logger, logContext, redact } from "./logger";

type MetaResult = {
  id?: string;
  status_code?: string;
  status?: string;
  error?: { message?: string; [key: string]: unknown };
};

export async function metaRequest(
  url: string,
  token: string,
  signal: AbortSignal,
  fields?: Record<string, string>,
) {
  const details = {
    ...logContext(),
    requestId: randomUUID(),
    method: fields ? "POST" : "GET",
    url,
  };
  const debug = (event: string, data: Record<string, unknown>) =>
    logger.debug(
      event,
      redact({ ...details, ...data }, [token]) as Record<string, unknown>,
    );
  debug("meta.request", {
    fields: fields ?? Object.fromEntries(new URL(url).searchParams),
  });
  const started = performance.now();
  let phase = "fetch";
  try {
    const response = await fetch(url, {
      method: details.method,
      headers: { Authorization: `Bearer ${token}` },
      ...(fields
        ? { body: new URLSearchParams(fields) }
        : { cache: "no-store" as const }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    });
    phase = "read-response";
    const body = await response.text();
    const headers = Object.fromEntries(
      [
        "content-type",
        "x-fb-trace-id",
        "x-fb-request-id",
        "x-app-usage",
        "x-page-usage",
        "retry-after",
      ].flatMap((key) =>
        response.headers.has(key) ? [[key, response.headers.get(key)]] : [],
      ),
    );
    let data: MetaResult;
    phase = "parse-response";
    try {
      data = JSON.parse(body);
    } catch (error) {
      debug("meta.response", {
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        headers,
        body,
      });
      throw error;
    }
    debug("meta.response", {
      status: response.status,
      durationMs: Math.round(performance.now() - started),
      headers,
      body: data,
    });
    return { response, data };
  } catch (error) {
    debug("meta.failure", {
      phase,
      durationMs: Math.round(performance.now() - started),
      error,
    });
    throw error;
  }
}
