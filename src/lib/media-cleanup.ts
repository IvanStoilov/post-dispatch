import { after } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../db";
import { accountMediaCleanup } from "../db/schema";
import { purgeProjectMedia } from "./storage";
import type { StorageLocation } from "./storage/types";
import { logger } from "./logger";

// Durable removal of a deleted project's stored media. Deletion records
// what to purge in its transaction; recovery (the publishing cron and the
// local worker) removes the files, retrying until storage confirms.

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
type Media = Omit<StorageLocation, "imageKey"> & {
  projectId: string;
  imageKey: string;
};

// Records one purge per project and storage location. The configured
// location is always included, to catch objects whose DB insert failed;
// the project prefix is swept too.
export async function queueMediaCleanup(
  tx: Tx,
  projectIds: string[],
  media: Media[],
  configuredLocation?: Omit<StorageLocation, "imageKey">,
) {
  const targets = projectIds.flatMap((projectId) => {
    const objects = media.filter((m) => m.projectId === projectId);
    const locations = new Map(
      objects.map((object) => [
        `${object.storageProvider}:${object.imageBucket}`,
        {
          storageProvider: object.storageProvider,
          imageBucket: object.imageBucket,
        },
      ]),
    );
    if (configuredLocation)
      locations.set(
        `${configuredLocation.storageProvider}:${configuredLocation.imageBucket}`,
        configuredLocation,
      );
    return [...locations.values()].map((location) => ({
      bucket: location.imageBucket,
      storageProvider: location.storageProvider,
      prefix: `${projectId}/`,
      objectKeys: [
        ...new Set(
          objects
            .filter(
              (m) =>
                m.storageProvider === location.storageProvider &&
                m.imageBucket === location.imageBucket,
            )
            .map((m) => m.imageKey),
        ),
      ],
      finalSweepAfter: new Date(Date.now() + 60 * 60000),
    }));
  });
  if (targets.length) await tx.insert(accountMediaCleanup).values(targets);
}

/** Shares the existing recovery cron/worker; requires no additional provider. */
export async function recoverMediaCleanup(limit = 10) {
  const due = await getDb()
    .select({ id: accountMediaCleanup.id })
    .from(accountMediaCleanup)
    .where(lte(accountMediaCleanup.nextAttemptAt, new Date()))
    .limit(limit);
  let completed = 0;
  for (const { id } of due) {
    try {
      await getDb().transaction(async (tx) => {
        const [target] = await tx
          .select()
          .from(accountMediaCleanup)
          .where(
            and(
              eq(accountMediaCleanup.id, id),
              lte(accountMediaCleanup.nextAttemptAt, new Date()),
            ),
          )
          .for("update", { skipLocked: true });
        if (!target) return;
        const empty = await purgeProjectMedia(target);
        if (empty && new Date() >= target.finalSweepAfter) {
          await tx
            .delete(accountMediaCleanup)
            .where(eq(accountMediaCleanup.id, id));
          completed++;
        } else {
          await tx
            .update(accountMediaCleanup)
            .set({
              objectKeys: [],
              attempts: target.attempts + 1,
              nextAttemptAt: empty
                ? target.finalSweepAfter
                : new Date(Date.now() + 60000),
            })
            .where(eq(accountMediaCleanup.id, id));
        }
      });
    } catch (error) {
      logger.error("account.media_cleanup.failed", { cleanupId: id, error });
      await getDb()
        .update(accountMediaCleanup)
        .set({ nextAttemptAt: new Date(Date.now() + 5 * 60000) })
        .where(eq(accountMediaCleanup.id, id));
    }
  }
  return completed;
}

// Runs media cleanup recovery after the response is sent; outside a request
// (scripts, tests) there is no after(), so it runs inline instead.
export async function scheduleMediaCleanupRecovery(failureEvent: string) {
  const cleanup = async () => {
    try {
      await recoverMediaCleanup();
    } catch (error) {
      logger.error(failureEvent, { error });
    }
  };
  try {
    after(cleanup);
  } catch {
    await cleanup();
  }
}
