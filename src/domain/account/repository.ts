import "server-only";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import type { Tx } from "../shared/db";
import { users, verifications } from "@/db/schema";

// Every query on the user row and the account's verification records
// (deletion attempts, auth codes, pending connections).

export async function lockUser(tx: Tx, userId: string) {
  const [user] = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  return user;
}

export async function findVerification(tx: Tx, identifier: string) {
  const [record] = await tx
    .select()
    .from(verifications)
    .where(eq(verifications.identifier, identifier));
  return record;
}

export async function replaceVerification(
  tx: Tx,
  previousId: string | undefined,
  values: { identifier: string; value: string; expiresAt: Date },
) {
  if (previousId) {
    await tx.delete(verifications).where(eq(verifications.id, previousId));
  }
  await tx.insert(verifications).values({ id: randomUUID(), ...values });
}

// Verification records aren't tied to users by foreign keys, so deletion
// scans them.
export function allVerifications(tx: Tx) {
  return tx.select().from(verifications);
}

export async function deleteVerifications(tx: Tx, ids: string[]) {
  if (ids.length) {
    await tx.delete(verifications).where(inArray(verifications.id, ids));
  }
}

// Sessions, password accounts, MCP tokens, consents, OAuth tokens and terms
// acceptances cascade.
export async function deleteUser(tx: Tx, userId: string) {
  await tx.delete(users).where(eq(users.id, userId));
}
