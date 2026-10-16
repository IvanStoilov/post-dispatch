import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, gt, inArray, like, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { verifications } from "@/db/schema";
import type { Executor } from "../shared/db";

// Pending connect flows live in the auth library's verifications table,
// keyed by a hash of the flow's nonce (the browser holds the nonce).

const prefix = "meta-connect:";
const identifier = (nonce: string) =>
  `${prefix}${createHash("sha256").update(nonce).digest("hex")}`;
const live = (nonce: string) =>
  and(
    eq(verifications.identifier, identifier(nonce)),
    gt(verifications.expiresAt, new Date()),
  );

// Also removes expired flows, which keeps abandoned ones bounded.
export async function insertPending(
  nonce: string,
  sealed: string,
  lifetimeSeconds: number,
) {
  await getDb()
    .delete(verifications)
    .where(
      and(
        like(verifications.identifier, `${prefix}%`),
        lte(verifications.expiresAt, new Date()),
      ),
    );
  await getDb()
    .insert(verifications)
    .values({
      id: randomUUID(),
      identifier: identifier(nonce),
      value: sealed,
      expiresAt: new Date(Date.now() + lifetimeSeconds * 1000),
    });
}

export async function findPending(nonce: string) {
  const [row] = await getDb().select().from(verifications).where(live(nonce));
  return row;
}

// Deletes the flow if it is still live; false when another request
// already used it.
export async function claimPending(id: string, nonce: string) {
  const claimed = await getDb()
    .delete(verifications)
    .where(and(eq(verifications.id, id), live(nonce)))
    .returning({ id: verifications.id });
  return claimed.length > 0;
}

export function listAllPending(db: Executor) {
  return db
    .select()
    .from(verifications)
    .where(like(verifications.identifier, `${prefix}%`));
}

export async function deleteByIds(db: Executor, ids: string[]) {
  if (ids.length)
    await db.delete(verifications).where(inArray(verifications.id, ids));
}
