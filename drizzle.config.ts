import { config } from "./src/lib/config";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
loadEnvConfig(process.cwd());
if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required in .env");
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: config.DATABASE_URL },
});
