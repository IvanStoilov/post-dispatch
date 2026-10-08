import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb } from "../src/db";
import { recoverPublishingJobs } from "../src/lib/publish-jobs";
import { queueDriver } from "../src/lib/queue";
loadEnvConfig(process.cwd());
async function main() {
  if (queueDriver() !== "local")
    throw new Error("The local publishing worker requires QUEUE_DRIVER=local");
  let running = true;
  process.on("SIGINT", () => {
    running = false;
  });
  process.on("SIGTERM", () => {
    running = false;
  });
  console.log(
    "Local publishing worker started. Jobs and progress are saved in Postgres.",
  );
  try {
    while (running) {
      await recoverPublishingJobs().catch((error) =>
        console.error(
          "Publishing recovery failed:",
          error instanceof Error ? error.message : "Unknown error",
        ),
      );
      if (running) await delay(5000);
    }
  } finally {
    await closeDb();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
