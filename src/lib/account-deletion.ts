import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "../db";
import {
  users,
  projects,
  verifications,
  accountMediaCleanup,
} from "../db/schema";
import { config } from "./config";
import { bucket, purgeProjectMedia } from "./storage";
import { pendingConnectionBelongsTo } from "./connector-connect";
import { loggedOperation, logger } from "./logger";

import {
  deleteProjectData,
  DataDeletionError as AccountDeletionError,
} from "./project-deletion";
export { DataDeletionError as AccountDeletionError } from "./project-deletion";

// Persisted rate limit so incorrect password attempts cannot be spread across instances.
export async function limitDeletionAttempts(userId: string) {
  await getDb().transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    const identifier = `account-deletion-attempts:${userId}`;
    const [previous] = await tx
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, identifier));
    const attempts =
      previous && previous.expiresAt > new Date() ? Number(previous.value) : 0;
    if (attempts >= 5)
      throw new AccountDeletionError(
        "Too many deletion attempts. Try again in 15 minutes.",
        429,
      );
    if (previous)
      await tx.delete(verifications).where(eq(verifications.id, previous.id));
    await tx.insert(verifications).values({
      id: randomUUID(),
      identifier,
      value: String(attempts + 1),
      expiresAt:
        previous && previous.expiresAt > new Date()
          ? previous.expiresAt
          : new Date(Date.now() + 15 * 60000),
    });
  });
}

export async function deleteOwnAccount(userId: string) {
  return loggedOperation("account.delete", { userId }, async () => {
    // Include the configured bucket to catch objects whose earlier DB insert failed.
    const configuredBucket = config.AWS_ENDPOINT_URL_S3
      ? await bucket()
      : undefined;
    await getDb().transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) throw new AccountDeletionError("Account not found.", 404);
      // FK checks block new project/content registrations while these rows are locked.
      const owned = await tx
        .select()
        .from(projects)
        .where(eq(projects.userId, userId))
        .orderBy(projects.id)
        .for("update");
      await deleteProjectData(tx, owned, configuredBucket, "account");
      // Verification records are not FK-bound, including OAuth codes and sealed connector handshakes.
      const records = await tx.select().from(verifications);
      const verificationIds = records
        .filter((record) => {
          if (
            record.value === userId ||
            record.identifier === user.email ||
            record.identifier === `account-deletion-attempts:${userId}`
          )
            return true;
          if (record.identifier.startsWith("meta-connect:"))
            return pendingConnectionBelongsTo(record.value, userId);
          try {
            const value = JSON.parse(record.value);
            return (
              value?.type === "authorization_code" && value.userId === userId
            );
          } catch {
            return false;
          }
        })
        .map((r) => r.id);
      if (verificationIds.length)
        await tx
          .delete(verifications)
          .where(inArray(verifications.id, verificationIds));
      // Auth sessions, password accounts, MCP tokens, consents and OAuth tokens cascade.
      await tx.delete(users).where(eq(users.id, userId));
    });
    logger.info("account.deleted", { userId });
  });
}

/** Shares the existing recovery cron/worker; requires no additional provider. */
export async function recoverAccountMediaCleanup(limit = 10) {
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
