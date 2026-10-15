import assert from "node:assert/strict";
import { test } from "node:test";
import {
  config,
  parseConfig,
  requireConfig,
  environmentSecrets,
} from "../src/lib/config";

test("configuration defaults and optional integrations are centralized", () => {
  const values = parseConfig({});
  assert.equal(values.APP_URL, "http://localhost:8200");
  assert.equal(values.META_API_VERSION, "v25.0");
  assert.equal(values.LINKEDIN_ORGANIZATION_POSTING, false);
  assert.equal(values.LOG_LEVEL, "debug");
  assert.equal(values.MAIL_PROVIDER, "console");
  assert.equal(values.QUEUE_DRIVER, "local");
  assert.equal(values.STORAGE_PROVIDER, "local");
  assert.equal(values.LOCAL_STORAGE_PATH, "data/media");
  const hosted = parseConfig({ NODE_ENV: "production" });
  assert.equal(hosted.QUEUE_DRIVER, "vercel");
  assert.equal(hosted.STORAGE_PROVIDER, "s3");
  assert.equal(parseConfig({ VERCEL: "1" }).STORAGE_PROVIDER, "s3");
  assert.equal(hosted.MAIL_PROVIDER, undefined);
  assert.equal(hosted.MAIL_FROM, undefined);
  assert.equal(values.LINKEDIN_CLIENT_SECRET, undefined);
  assert.equal(values.AWS_ENDPOINT_URL_S3, undefined);
  assert.ok(Object.isFrozen(values));
  assert.ok(Object.isFrozen(config));
});

test("URLs, empty values and typed settings are normalized", () => {
  const values = parseConfig({
    APP_URL: " https://ramblo.io/ ",
    FACEBOOK_APP_ID: "  ",
    LINKEDIN_ORGANIZATION_POSTING: "true",
    LEGACY_OWNER_EMAIL: "Owner@Example.com",
    MAIL_PROVIDER: "sendgrid",
    MAIL_FROM: "Ramblo <hello@ramblo.io>",
  });
  assert.equal(values.APP_URL, "https://ramblo.io");
  assert.equal(values.FACEBOOK_APP_ID, undefined);
  assert.equal(values.LINKEDIN_ORGANIZATION_POSTING, true);
  assert.equal(values.LEGACY_OWNER_EMAIL, "owner@example.com");
});

test("invalid environment settings report keys and rules without echoing secrets", () => {
  for (const [key, value] of Object.entries({
    APP_URL: "https://ramblo.io/path?token=private",
    DATABASE_URL: "https://db.example/private",
    AWS_ENDPOINT_URL_S3: "https://user:secret@storage.example",
    CREDENTIALS_ENCRYPTION_KEY: "private-invalid-key",
    META_API_VERSION: "25",
    LINKEDIN_API_VERSION: "202613",
    LINKEDIN_ORGANIZATION_POSTING: "yes",
    LOG_LEVEL: "noisy",
    MAIL_PROVIDER: "unknown",
    MAIL_FROM: "invalid\r\nBcc: victim@example.com",
    MAIL_REPLY_TO: "invalid",
    LEGACY_OWNER_EMAIL: "invalid",
    QUEUE_DRIVER: "other",
    STORAGE_PROVIDER: "other",
    VERCEL: "yes",
  })) {
    assert.throws(
      () => parseConfig({ [key]: value }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes(key));
        if (value.length > 12) assert.ok(!error.message.includes(value));
        return true;
      },
    );
  }
});

test("lazy configuration respects CLI env loading and validates changed values", () => {
  const original = { ...process.env };
  try {
    delete process.env.VERCEL_URL;
    process.env.APP_URL = "https://one.example/";
    assert.equal(config.APP_URL, "https://one.example");
    process.env.APP_URL = "https://two.example";
    assert.equal(config.APP_URL, "https://two.example");
    process.env.APP_URL = "ftp://invalid.example";
    assert.throws(() => config.APP_URL, /APP_URL/);
    delete process.env.RESEND_API_KEY;
    assert.throws(
      () => requireConfig("RESEND_API_KEY"),
      /RESEND_API_KEY is required/,
    );
    process.env.RESEND_API_KEY = "private-test-key";
    assert.equal(requireConfig("RESEND_API_KEY"), "private-test-key");
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      "invalid-secret-that-must-still-be-redacted";
    assert.ok(
      environmentSecrets().includes(process.env.CREDENTIALS_ENCRYPTION_KEY),
    );
  } finally {
    process.env = original;
  }
});

test("malformed URLs produce safe configuration errors", () => {
  for (const key of ["APP_URL", "DATABASE_URL", "AWS_ENDPOINT_URL_S3"]) {
    assert.throws(
      () => parseConfig({ [key]: "private-malformed-url" }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, "ConfigError");
        assert.ok(error.message.includes(key));
        assert.ok(!error.message.includes("private-malformed-url"));
        return true;
      },
    );
  }
});

test("Vercel deployment URL takes precedence over APP_URL", () => {
  for (const VERCEL_URL of [
    "ramblo-preview.vercel.app",
    "https://ramblo-preview.vercel.app/",
  ]) {
    const values = parseConfig({ VERCEL_URL, APP_URL: "https://ramblo.io" });
    assert.equal(values.APP_URL, "https://ramblo-preview.vercel.app");
    assert.equal(values.VERCEL_URL, "https://ramblo-preview.vercel.app");
  }
  assert.equal(
    parseConfig({ VERCEL_URL: "  ", APP_URL: "https://ramblo.io" }).APP_URL,
    "https://ramblo.io",
  );
  assert.throws(
    () => parseConfig({ VERCEL_URL: "https://deployment.example/path" }),
    /VERCEL_URL/,
  );
  const original = { ...process.env };
  try {
    process.env.APP_URL = "https://ramblo.io";
    process.env.VERCEL_URL = "ramblo-preview.vercel.app";
    assert.equal(config.APP_URL, "https://ramblo-preview.vercel.app");
    delete process.env.VERCEL_URL;
    assert.equal(config.APP_URL, "https://ramblo.io");
  } finally {
    process.env = original;
  }
});
