import { logger } from "../lib/logger";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
const state = globalThis as typeof globalThis & {
  dispatchDatabase?: { pool: Pool; db: NodePgDatabase<typeof schema> };
};
export function getDb() {
  if (!state.dispatchDatabase) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error(
        "DATABASE_URL is required. Configure your Postgres connection in .env.",
      );
    const pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
    });
    pool.on("error", (error) => {
      logger.error("database.connection.failure", { error });
    });
    state.dispatchDatabase = { pool, db: drizzle(pool, { schema }) };
    logger.debug("database.pool.created", { maxConnections: 5 });
  }
  return state.dispatchDatabase.db;
}
export async function closeDb() {
  const database = state.dispatchDatabase;
  delete state.dispatchDatabase;
  if (database) {
    await database.pool.end();
    logger.debug("database.pool.closed");
  }
}
