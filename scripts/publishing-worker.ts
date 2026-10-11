import { config } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb } from "../src/db";
import { recoverPublishingJobs } from "../src/lib/publish-jobs";
import { queueDriver } from "../src/lib/queue";
loadEnvConfig(process.cwd());
// Static imports initialize Winston before this script loads .env files.
logger.level = config.LOG_LEVEL;
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
  logger.info("publishing.worker.started", {
    driver: "local",
    intervalMs: 5000,
  });
  try {
    while (running) {
      await recoverPublishingJobs().catch((error) =>
        logger.error("publishing.worker.recovery.failure", { error }),
      );
      if (running) await delay(5000);
    }
  } finally {
    await closeDb();
    logger.info("publishing.worker.stopped");
  }
}
main().catch((error) => {
  logger.error("publishing.worker.failure", { error });
  process.exitCode = 1;
});
