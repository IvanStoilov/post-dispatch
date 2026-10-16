import process from "node:process";
import { z } from "zod";
import { brand } from "./brand";

// Node-only by design. Never import this module into a Client Component.
const optionalText = z.string().min(1).optional();
const webUrl = z.url().refine((value) => {
  if (!URL.canParse(value)) {
    return false;
  }
  const url = new URL(value);
  return (
    ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
  );
}, "must be an HTTP(S) URL without embedded credentials");
const originUrl = webUrl
  .refine((value) => {
    if (!URL.canParse(value)) {
      return false;
    }
    const url = new URL(value);
    return url.pathname === "/" && !url.search && !url.hash;
  }, "must be an origin without a path, query, or fragment")
  .transform((value) => new URL(value).origin);

function withUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
}

const sender = z
  .string()
  .refine(
    (value) =>
      !/[\r\n]/.test(value) &&
      /^(?:[^<>]+ <)?[^@<>\s]+@[^<>\s]+>?$/.test(value),
    "must be an email address, optionally with a display name",
  );

export const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  VERCEL: z.enum(["0", "1"]).default("0"),
  VERCEL_URL: z.preprocess(
    (value) => (typeof value === "string" ? withUrlScheme(value) : value),
    originUrl.optional(),
  ),
  APP_URL: originUrl.default("http://localhost:8200"),
  APPLICATION_URL: originUrl.default("https://app.ramblo.io"),
  PUBLIC_URL: originUrl.default("https://www.ramblo.io"),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  DATABASE_URL: z
    .url()
    .refine(
      (value) =>
        URL.canParse(value) &&
        ["postgres:", "postgresql:"].includes(new URL(value).protocol),
      "must be a Postgres URL",
    )
    .optional(),
  BETTER_AUTH_SECRET: optionalText,
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[a-f\d]{64}$/i,
      "must be a 32-byte hexadecimal key (64 characters)",
    )
    .optional(),
  LEGACY_OWNER_EMAIL: z
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
  AWS_ENDPOINT_URL_S3: webUrl.optional(),
  AWS_ACCESS_KEY_ID: optionalText,
  AWS_SECRET_ACCESS_KEY: optionalText,
  AWS_REGION: optionalText,
  AWS_S3_BUCKET: optionalText,
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  LOCAL_STORAGE_PATH: z.string().min(1).default("data"),
  META_API_VERSION: z
    .string()
    .regex(/^v\d+\.\d+$/, "must use the format v25.0")
    .default("v25.0"),
  FACEBOOK_APP_ID: optionalText,
  FACEBOOK_APP_SECRET: optionalText,
  INSTAGRAM_APP_ID: optionalText,
  INSTAGRAM_APP_SECRET: optionalText,
  LINKEDIN_CLIENT_ID: optionalText,
  LINKEDIN_CLIENT_SECRET: optionalText,
  LINKEDIN_API_VERSION: z
    .string()
    .regex(/^\d{4}(0[1-9]|1[0-2])$/, "must use the format YYYYMM")
    .default("202605"),
  LINKEDIN_ORGANIZATION_POSTING: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
    .default("debug"),
  QUEUE_DRIVER: z
    .enum(["local", "vercel"], { error: "must be local or vercel" })
    .default("local"),
  CRON_SECRET: optionalText,
  MAIL_PROVIDER: z
    .enum(["console", "maildev", "resend", "sendgrid"], {
      error: "must be console, maildev, resend or sendgrid",
    })
    .optional(),
  MAIL_FROM: sender.optional(),
  MAIL_REPLY_TO: z.email().optional(),
  RESEND_API_KEY: optionalText,
  SENDGRID_API_KEY: optionalText,
  COMPANY_REGISTERED_ADDRESS: z
    .string()
    .min(1)
    .default("Av. de la Pineda 2, 08860 Castelldefels, Spain"),
  COMPANY_TAX_ID: z.string().min(1).default("Y4966626C"),
  COMPANY_REGISTRY_DETAILS: z.string().default(""),
  FONTCONFIG_FILE: optionalText,
});
export type Config = z.infer<typeof configSchema>;
export type ConfigKey = keyof Config;
type Environment = Record<string, string | undefined>;

function normalized(value: string | undefined) {
  return value?.trim() || undefined;
}
function environmentValue(key: string, environment: Environment) {
  if (key === "APP_URL") {
    const vercelUrl = normalized(environment.VERCEL_URL);
    if (vercelUrl) {
      return withUrlScheme(vercelUrl);
    }
  }
  const value = normalized(environment[key]);
  if (value !== undefined) {
    return value;
  }
  const production = environment.NODE_ENV === "production";
  if (key === "QUEUE_DRIVER") {
    return production || environment.VERCEL === "1" ? "vercel" : "local";
  }
  if (key === "STORAGE_PROVIDER") {
    return production || environment.VERCEL === "1" ? "s3" : "local";
  }
  if (key === "MAIL_PROVIDER") {
    return production ? undefined : "console";
  }
  if (key === "MAIL_FROM") {
    return production ? undefined : `${brand.name} <${brand.email}>`;
  }
  return undefined;
}
export class ConfigError extends Error {
  constructor(issues: { path: PropertyKey[]; message: string }[]) {
    // Zod's raw error may contain secrets; expose field names and rules only.
    super(
      "Invalid configuration: " +
        issues
          .map((issue) => `${issue.path.join(".")} ${issue.message}`)
          .join("; "),
    );
    this.name = "ConfigError";
  }
}

/** Validate every declared setting, useful for scripts and deployment checks. */
export function parseConfig(environment: Environment): Config {
  const input = Object.fromEntries(
    Object.keys(configSchema.shape).map((key) => [
      key,
      environmentValue(key, environment),
    ]),
  );
  const result = configSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigError(result.error.issues);
  }
  return Object.freeze(result.data);
}

export const validateConfig = () => parseConfig(process.env);

/** Reads are lazy so Next builds need no unused credentials, CLI env loading works,
 * and tests can change env without module resets. Every read is validated. */
export const config: Readonly<Config> = Object.freeze(
  Object.defineProperties(
    {},
    Object.fromEntries(
      Object.entries(configSchema.shape).map(([key, schema]) => [
        key,
        {
          enumerable: true,
          get() {
            const result = schema.safeParse(environmentValue(key, process.env));
            if (!result.success) {
              throw new ConfigError(
                result.error.issues.map((issue) => ({
                  ...issue,
                  path: [key, ...issue.path],
                })),
              );
            }
            return result.data;
          },
        },
      ]),
    ),
  ),
) as Config;

export function requireConfig<K extends ConfigKey>(
  key: K,
): NonNullable<Config[K]> {
  const value = config[key];
  if (value === undefined) {
    throw new Error(`${key} is required`);
  }
  return value as NonNullable<Config[K]>;
}

// Logging must redact even INVALID secrets. Do not parse here or throw while
// logging a configuration failure. Includes extra secret env owned by tooling.
export function environmentSecrets(): string[] {
  return Object.entries(process.env)
    .filter(([key]) =>
      /SECRET|TOKEN|PASSWORD|DATABASE_URL|ACCESS_KEY|CREDENTIALS_ENCRYPTION_KEY/.test(
        key,
      ),
    )
    .map(([, value]) => value || "")
    .filter((value) => value.length >= 8);
}

/** Fontconfig needs a real process environment variable for the native renderer. */
export function setFontconfigFile(path: string) {
  process.env.FONTCONFIG_FILE = z.string().min(1).parse(path);
}
