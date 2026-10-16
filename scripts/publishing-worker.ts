import { config } from "../src/lib/config";
import { logger } from "../src/lib/logger";
import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb } from "../src/db";
import { publishingSystemService } from "../src/domain/publishing";
import { recoverAccountMediaCleanup } from "../src/lib/account-deletion";
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
      await publishingSystemService
        .recoverJobs()
        .catch((error) =>
          logger.error("publishing.worker.recovery.failure", { error }),
        );
      await recoverAccountMediaCleanup().catch((error) =>
        logger.error("account.media_cleanup.recovery.failed", { error }),
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
