// Preloaded before every test file (see the "test" script in package.json).
// Tests always use local storage in a temporary folder of their own, so they
// can never reach a real S3 bucket from .env. Blank S3 settings stay unset:
// loadEnvConfig never overrides variables that are already defined.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "ramblo-test-storage-"));
process.env.STORAGE_PROVIDER = "local";
process.env.LOCAL_STORAGE_PATH = join(root, "data");
process.env.RAMBLO_TEST_STORAGE_ROOT = root;
for (const key of [
  "AWS_ENDPOINT_URL_S3",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_S3_BUCKET",
])
  process.env[key] = "";
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
