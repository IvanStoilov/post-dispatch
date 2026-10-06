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
    pool.on("error", () => {
      console.error("PostDispatch: an idle database connection failed.");
    });
    state.dispatchDatabase = { pool, db: drizzle(pool, { schema }) };
  }
  return state.dispatchDatabase.db;
}
export async function closeDb() {
  const database = state.dispatchDatabase;
  delete state.dispatchDatabase;
  if (database) await database.pool.end();
}
