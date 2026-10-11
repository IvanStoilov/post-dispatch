import { loadEnvConfig } from "@next/env";
import { validateConfig } from "../src/lib/config";
loadEnvConfig(process.cwd());
try {
  validateConfig();
  console.log("Environment configuration is valid. No values were printed.");
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Invalid configuration",
  );
  process.exitCode = 1;
}
