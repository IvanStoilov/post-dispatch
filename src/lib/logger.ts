import { AsyncLocalStorage } from "node:async_hooks";
import winston from "winston";

const context = new AsyncLocalStorage<{ projectId: string; postId: string }>();
export const withLogContext = <T>(
  value: { projectId: string; postId: string },
  operation: () => T,
): T => context.run(value, operation);
export const logContext = () => context.getStore() ?? {};

const level = process.env.LOG_LEVEL || "debug";
export const logger = winston.createLogger({
  level: Object.hasOwn(winston.config.npm.levels, level) ? level : "debug",
  format: winston.format.combine(
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
    result = result.replace(/https?:\/\/[^\s"<>]+/gi, (match) => {
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
    });
    return result.length > 8192
      ? result.slice(0, 8192) + "[truncated]"
      : result;
  }
  if (value instanceof Error)
    return redact(
      { name: value.name, message: value.message, cause: value.cause },
      secrets,
      depth + 1,
    );
  if (Array.isArray(value))
    return value.map((item) => redact(item, secrets, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|token|secret|password|signature|credential/i.test(key)
          ? "[REDACTED]"
          : redact(item, secrets, depth + 1),
      ]),
    );
  return value;
}
