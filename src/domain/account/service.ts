import "server-only";
import { getDb } from "@/db";
import { loggedOperation, logger } from "@/lib/logger";
import { scheduleMediaCleanupRecovery } from "@/lib/media-cleanup";
import { newStorageLocation } from "@/lib/storage/index";
import { connectionsSystemService } from "../connections";
import { projectsSystemService } from "../projects";
import type { Actor } from "../shared/actor";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import * as repository from "./repository";

// The user's account as a whole. Signing up and signing in belong to the
// auth library (src/lib/auth.ts); this module deletes accounts.

const MAX_DELETION_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60000;

// Counts deletion attempts in the database, so password guesses can't be
// spread across instances.
async function countAttempt(userId: string) {
  await getDb().transaction(async (tx) => {
    await repository.lockUser(tx, userId);
    const identifier = `account-deletion-attempts:${userId}`;
    const previous = await repository.findVerification(tx, identifier);
    const live = previous && previous.expiresAt > new Date();
    const attempts = live ? Number(previous.value) : 0;
    if (attempts >= MAX_DELETION_ATTEMPTS)
      throw new UserFacingError(
        "Too many deletion attempts. Try again in 15 minutes.",
        429,
      );
    await repository.replaceVerification(tx, previous?.id, {
      identifier,
      value: String(attempts + 1),
      expiresAt: live
        ? previous.expiresAt
        : new Date(Date.now() + ATTEMPT_WINDOW_MS),
    });
  });
}

// Records that belong to the user: auth codes and deletion attempts.
// (Pending connections are removed by the connections module.)
async function ownVerificationIds(tx: Tx, user: { id: string; email: string }) {
  return (await repository.allVerifications(tx))
    .filter((record) => {
      if (
        record.value === user.id ||
        record.identifier === user.email ||
        record.identifier === `account-deletion-attempts:${user.id}`
      )
        return true;
      try {
        const value = JSON.parse(record.value);
        return value?.type === "authorization_code" && value.userId === user.id;
      } catch {
        return false;
      }
    })
    .map((record) => record.id);
}

// Deletes the account and everything in it after the user proves it's
// them again: `verifyPassword` (from the transport, which holds the
// credentials) runs after the attempt is counted. Stored media is removed
// after the response; posts already on networks stay there.
async function deleteAccount(
  actor: Actor,
  { verifyPassword }: { verifyPassword: () => Promise<boolean> },
): Promise<void> {
  return loggedOperation("domain.account.delete", actor, async () => {
    await countAttempt(actor.userId);
    if (!(await verifyPassword()))
      throw new UserFacingError(
        "Your password could not be verified. Check it or sign in again.",
        400,
      );
    // Include the configured bucket to catch objects whose DB insert failed.
    const location = await newStorageLocation();
    await getDb().transaction(async (tx) => {
      const user = await repository.lockUser(tx, actor.userId);
      if (!user) throw new UserFacingError("Account not found.", 404);
      // Locked rows block new projects and content while this runs.
      await projectsSystemService.deleteAllOwned(tx, user.id, location);
      await connectionsSystemService.deletePending(tx, user.id);
      await repository.deleteVerifications(
        tx,
        await ownVerificationIds(tx, user),
      );
      await repository.deleteUser(tx, user.id);
    });
    logger.info("account.deleted", actor);
    await scheduleMediaCleanupRecovery("account.media_cleanup.recovery.failed");
  });
}

// For routers, pages and MCP tools acting for a signed-in user.
export const accountService = { deleteAccount };
