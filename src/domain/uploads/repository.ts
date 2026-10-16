import "server-only";
import { and, count, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Executor, Tx } from "../shared/db";
import { getDb } from "@/db";
import { directUploads, imageUploads, uploadTokens } from "@/db/schema";

// Every query on upload tokens, direct uploads (files on their way to
// storage) and image uploads (stored files waiting for a draft).

const minutesFromNow = (minutes: number) =>
  sql.raw(`now() + interval '${minutes} minutes'`);

export async function deleteExpiredTokens(projectId: string) {
  await getDb()
    .delete(uploadTokens)
    .where(
      and(
        eq(uploadTokens.projectId, projectId),
        lte(uploadTokens.expiresAt, sql`now()`),
      ),
    );
}

export async function insertToken(
  projectId: string,
  tokenHash: string,
  uploads: number,
  ttlMinutes: number,
) {
  const [token] = await getDb()
    .insert(uploadTokens)
    .values({
      projectId,
      tokenHash,
      uploadsRemaining: uploads,
      expiresAt: minutesFromNow(ttlMinutes),
    })
    .returning();
  return token;
}

// Takes one use of a valid token for the project; undefined when the token
// is wrong, expired, used up or for another project.
export async function spendToken(projectId: string, tokenHash: string) {
  const [spent] = await getDb()
    .update(uploadTokens)
    .set({ uploadsRemaining: sql`${uploadTokens.uploadsRemaining} - 1` })
    .where(
      and(
        eq(uploadTokens.tokenHash, tokenHash),
        eq(uploadTokens.projectId, projectId),
        gt(uploadTokens.expiresAt, sql`now()`),
        gt(uploadTokens.uploadsRemaining, 0),
      ),
    )
    .returning({ id: uploadTokens.id });
  return spent?.id;
}

export async function refundToken(id: string) {
  await getDb()
    .update(uploadTokens)
    .set({ uploadsRemaining: sql`${uploadTokens.uploadsRemaining} + 1` })
    .where(eq(uploadTokens.id, id));
}

export function deleteExpiredImageUploads(projectId: string) {
  return getDb()
    .delete(imageUploads)
    .where(
      and(
        eq(imageUploads.projectId, projectId),
        lte(imageUploads.expiresAt, sql`now()`),
      ),
    )
    .returning();
}

export function deleteExpiredDirectUploads(projectId: string) {
  return getDb()
    .delete(directUploads)
    .where(
      and(
        eq(directUploads.projectId, projectId),
        lte(directUploads.expiresAt, sql`now()`),
      ),
    )
    .returning();
}

// Files the project has started or stored but not yet attached to a draft.
export async function countUnused(projectId: string) {
  const [{ pending }] = await getDb()
    .select({ pending: count() })
    .from(directUploads)
    .where(
      and(
        eq(directUploads.projectId, projectId),
        eq(directUploads.completed, false),
      ),
    );
  const [{ unclaimed }] = await getDb()
    .select({ unclaimed: count() })
    .from(imageUploads)
    .where(eq(imageUploads.projectId, projectId));
  return pending + unclaimed;
}

export async function insertImageUpload(
  values: Omit<typeof imageUploads.$inferInsert, "expiresAt">,
  ttlMinutes: number,
  db: Executor = getDb(),
) {
  const [upload] = await db
    .insert(imageUploads)
    .values({ ...values, expiresAt: minutesFromNow(ttlMinutes) })
    .returning();
  return upload;
}

// Deletes and returns the upload, so it can back only one post.
export async function claimImageUpload(tx: Tx, projectId: string, id: string) {
  const [upload] = await tx
    .delete(imageUploads)
    .where(
      and(
        eq(imageUploads.projectId, projectId),
        eq(imageUploads.id, id),
        gt(imageUploads.expiresAt, sql`now()`),
      ),
    )
    .returning();
  return upload;
}

export async function insertDirectUpload(
  values: Omit<typeof directUploads.$inferInsert, "expiresAt">,
  ttlMinutes: number,
) {
  const [upload] = await getDb()
    .insert(directUploads)
    .values({ ...values, expiresAt: minutesFromNow(ttlMinutes) })
    .returning();
  return upload;
}

// An unexpired direct upload that hasn't been completed, locked.
export async function lockOpenDirectUpload(
  tx: Tx,
  id: string,
  where: { projectId?: string; storageProvider?: "local" } = {},
) {
  const [upload] = await tx
    .select()
    .from(directUploads)
    .where(
      and(
        eq(directUploads.id, id),
        eq(directUploads.completed, false),
        gt(directUploads.expiresAt, sql`now()`),
        where.projectId
          ? eq(directUploads.projectId, where.projectId)
          : undefined,
        where.storageProvider
          ? eq(directUploads.storageProvider, where.storageProvider)
          : undefined,
      ),
    )
    .for("update");
  return upload;
}

export async function markCompleted(tx: Tx, id: string) {
  await tx
    .update(directUploads)
    .set({ completed: true })
    .where(eq(directUploads.id, id));
}

// Locks, deletes and returns the projects' uploads of both kinds.
export async function deleteInProjects(tx: Tx, projectIds: string[]) {
  const unclaimed = await tx
    .select()
    .from(imageUploads)
    .where(inArray(imageUploads.projectId, projectIds))
    .for("update");
  const pending = await tx
    .select()
    .from(directUploads)
    .where(inArray(directUploads.projectId, projectIds))
    .for("update");
  await tx
    .delete(directUploads)
    .where(inArray(directUploads.projectId, projectIds));
  await tx
    .delete(imageUploads)
    .where(inArray(imageUploads.projectId, projectIds));
  return [...unclaimed, ...pending];
}
