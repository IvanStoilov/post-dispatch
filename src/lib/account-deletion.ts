import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { users, verifications } from "../db/schema";
import { projectsSystemService } from "@/domain/projects";
import { UserFacingError as AccountDeletionError } from "@/domain/shared/errors";
import { newStorageLocation } from "./storage/index";
import { pendingConnectionBelongsTo } from "./pending-connections";
import { loggedOperation, logger } from "./logger";

// Failures the account route shows to the user, including the projects
// module's (for example while a publication is in progress).
export { AccountDeletionError };

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
    const configuredLocation = await newStorageLocation();
    await getDb().transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) throw new AccountDeletionError("Account not found.", 404);
      // FK checks block new project/content registrations while these rows are locked.
      await projectsSystemService.deleteAllOwned(
        tx,
        userId,
        configuredLocation,
      );
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
