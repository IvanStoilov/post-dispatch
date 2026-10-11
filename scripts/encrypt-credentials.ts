import { config } from "../src/lib/config";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import {
  encryptCredential,
  decryptCredential,
} from "../src/lib/credential-encryption";
import { logger } from "../src/lib/logger";
loadEnvConfig(process.cwd());
logger.level = config.LOG_LEVEL;

async function main() {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  // Validate the key before connecting, even if there are no existing credentials.
  decryptCredential(encryptCredential("", "access_token"), "access_token");
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
  });
  const client = await pool.connect().catch(async (error) => {
    await pool.end();
    throw error;
  });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '15s'");
    // Serialize with writers; a concurrent legacy process cannot reintroduce
    // plaintext while conversion and constraint validation are taking place.
    await client.query(
      "LOCK TABLE project_connectors IN SHARE ROW EXCLUSIVE MODE",
    );
    const { rows } = await client.query<{
      id: string;
      access_token: string;
      refresh_token: string | null;
    }>(
      "SELECT id, access_token, refresh_token FROM project_connectors FOR UPDATE",
    );
    let migrated = 0;
    for (const row of rows) {
      let changed = false;
      function convert(value: string, field: "access_token" | "refresh_token") {
        if (value.startsWith("pdcred:")) {
          decryptCredential(value, field); // Verify the key; never double encrypt.
          return value;
        }
        changed = true;
        return encryptCredential(value, field);
      }
      const access = convert(row.access_token, "access_token");
      const refresh =
        row.refresh_token === null
          ? null
          : convert(row.refresh_token, "refresh_token");
      if (changed) {
        await client.query(
          "UPDATE project_connectors SET access_token = $1, refresh_token = $2 WHERE id = $3",
          [access, refresh, row.id],
        );
        migrated++;
      }
    }
    // Migration 0012 adds these NOT VALID so old rows can be converted safely.
    await client.query(
      "ALTER TABLE project_connectors VALIDATE CONSTRAINT project_connectors_access_token_encrypted",
    );
    await client.query(
      "ALTER TABLE project_connectors VALIDATE CONSTRAINT project_connectors_refresh_token_encrypted",
    );
    await client.query("COMMIT");
    logger.info("credentials.migration.completed", {
      migrated,
      verified: rows.length,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  // Raw database errors may include a failing row containing existing secrets.
  logger.error("credentials.migration.failed", {
    reason:
      "Migration rolled back. Check the encryption key, database connection, and that db:migrate was run first.",
  });
  process.exitCode = 1;
});
