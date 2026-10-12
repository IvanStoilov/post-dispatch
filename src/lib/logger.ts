import { config, environmentSecrets } from "./config";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import winston from "winston";

export type LogContext = {
  requestId?: string;
  traceId?: string;
  operationId?: string;
  userId?: string;
  projectId?: string;
  postId?: string;
  jobId?: string;
  publicationId?: string;
  action?: string;
  provider?: string;
  tool?: string;
};
const context = new AsyncLocalStorage<
  LogContext & { redactionSecrets?: string[] }
>();
export const withLogContext = <T>(value: LogContext, operation: () => T): T =>
  context.run({ ...context.getStore(), ...value }, operation);
export const logContext = (): LogContext => {
  const { redactionSecrets: _private, ...safe } = context.getStore() ?? {};
  void _private;
  return safe;
};
export const withLogSecrets = <T>(secrets: string[], action: () => T): T =>
  context.run(
    {
      ...context.getStore(),
      redactionSecrets: [
        ...(context.getStore()?.redactionSecrets ?? []),
        ...secrets,
      ],
    },
    action,
  );

// Protect every transport, including callers that don't explicitly use redact().
const sanitize = winston.format((info) => {
  const secrets = [
    ...(context.getStore()?.redactionSecrets ?? []),
    ...environmentSecrets(),
  ];
  const safe = redact({ ...logContext(), ...info }, secrets) as Record<
    string,
    unknown
  >;
  for (const key of Object.keys(info)) delete info[key];
  Object.assign(info, safe);
  return info;
});

/** Record boundaries without logging arguments, bodies, results, or credentials. */
export async function loggedOperation<T>(
  operation: string,
  details: LogContext,
  action: () => Promise<T>,
): Promise<T> {
  return withLogContext({ ...details, operationId: randomUUID() }, async () => {
    const started = performance.now();
    logger.debug("operation.started", { operation });
    try {
      const result = await action();
      logger.log(
        result &&
          typeof result === "object" &&
          "isError" in result &&
          result.isError === true
          ? "warn"
          : "debug",
        "operation.completed",
        {
          operation,
          durationMs: Math.round(performance.now() - started),
          ...(result && typeof result === "object" && "isError" in result
            ? { outcome: result.isError ? "rejected" : "success" }
            : {}),
        },
      );
      return result;
    } catch (error) {
      logger.log(
        error instanceof Error && error.constructor.name === "MediaPending"
          ? "debug"
          : "error",
        error instanceof Error && error.constructor.name === "MediaPending"
          ? "operation.deferred"
          : "operation.failed",
        {
          operation,
          durationMs: Math.round(performance.now() - started),
          error,
        },
      );
      throw error;
    }
  });
}

/** Route labels are static; query strings and user-controlled paths stay private. */
export async function loggedRequest(
  request: Request,
  route: string,
  action: () => Promise<Response>,
): Promise<Response> {
  const requestId = randomUUID();
  return withLogContext({ requestId, traceId: requestId }, async () => {
    const started = performance.now();
    const authAction =
      route === "/api/auth/[...all]"
        ? new URL(request.url).pathname.replace("/api/auth/", "")
        : undefined;
    const details = {
      route,
      method: request.method,
      ...(authAction &&
      /^(sign-in\/email|sign-up\/email|sign-out|get-session|verify-email|send-verification-email|request-password-reset|reset-password|oauth2\/(authorize|token|consent|register|revoke|introspect))$/.test(
        authAction,
      )
        ? { authAction }
        : {}),
    };
    logger.debug("http.request", details);
    try {
      const response = await action();
      logger.log(
        response.status >= 500
          ? "error"
          : response.status >= 400
            ? "warn"
            : "debug",
        "http.response",
        {
          ...details,
          status: response.status,
          durationMs: Math.round(performance.now() - started),
        },
      );
      return response;
    } catch (error) {
      logger.error("http.failure", {
        ...details,
        error,
        durationMs: Math.round(performance.now() - started),
      });
      throw error;
    }
  });
}

const level = config.LOG_LEVEL;
export const logger = winston.createLogger({
  level: Object.hasOwn(winston.config.npm.levels, level) ? level : "debug",
  format: winston.format.combine(
    sanitize(),
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

// Sanitize before truncation: even a partial credential must not reach logs.
export function redact(
  value: unknown,
  secrets: string[] = [],
  depth = 0,
): unknown {
  if (depth > 12) return "[depth limit]";
  if (typeof value === "string") {
    let result = value;
    for (const secret of secrets.filter(Boolean)) {
      result = result.split(secret).join("[REDACTED]");
      result = result.split(encodeURIComponent(secret)).join("[REDACTED]");
    }
    result = result.replace(/Bearer\s+[^\s"<>]+/gi, "[REDACTED]");
    result = result.replace(
      /(?:https?|postgres(?:ql)?):\/\/[^\s"<>]+/gi,
      (match) => {
        try {
          const url = new URL(match);
          url.username = "";
          url.password = "";
          url.search = "";
          url.hash = "";
          return url.toString();
        } catch {
          return "[REDACTED URL]";
        }
      },
    );
    return result.length > 8192
      ? result.slice(0, 8192) + "[truncated]"
      : result;
  }
  if (value instanceof SyntaxError)
    return { name: value.name, message: "Malformed data" };
  if (value instanceof Error)
    return redact(
      {
        name: value.name,
        message: value.message,
        stack: value.stack,
        cause: value.cause,
      },
      secrets,
      depth + 1,
    );
  if (Array.isArray(value))
    return value.map((item) => redact(item, secrets, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|token|secret|password|signature|credential|cookie|^code$|^state$|base64|caption|commentary|^content$|download_url/i.test(
          key,
        ) && !(key === "code" && typeof item === "number")
          ? "[REDACTED]"
          : redact(item, secrets, depth + 1),
      ]),
    );
  return value;
}
