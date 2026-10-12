import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { logger, loggedOperation } from "../src/lib/logger";
async function main() {
  loadEnvConfig(process.cwd());
  try {
    const migration = await readFile(
      new URL("../drizzle/0014_post_publications.sql", import.meta.url),
      "utf8",
    );
    const start = migration.indexOf("-- Durable jobs know");
    if (start < 0) throw new Error("Publication backfill SQL not found");
    // INSERT ... ON CONFLICT DO NOTHING: repeat safely after deploying new workers
    // to catch publications completed by an older deployment during rollout.
    await loggedOperation("publications.backfill", {}, () =>
      getDb().execute(sql.raw(migration.slice(start))),
    );
    logger.info("publications.backfill.completed");
  } catch (error) {
    logger.error("publications.backfill.failed", { error });
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
void main();
