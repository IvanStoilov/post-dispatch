import "server-only";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { postPublications, publishJobs } from "@/db/schema";
import type { Tx } from "../shared/db";
import type { PublishJobPatch } from "./types";

// Every query on publish jobs and published copies. Rows never leave the
// domain.

export const activeStatuses = [
  "queued",
  "preparing",
  "waiting",
  "submitting",
] as const;

// A job update only applies while this worker still holds its lease.
function ownedLease(jobId: string, token: string) {
  return and(
    eq(publishJobs.id, jobId),
    eq(publishJobs.leaseToken, token),
    sql`${publishJobs.leaseExpiresAt} > now()`,
  );
}

export async function jobIdsForPost(tx: Tx, postId: string) {
  return tx
    .select({ id: publishJobs.id })
    .from(publishJobs)
    .where(eq(publishJobs.postId, postId));
}

export async function jobsForPost(tx: Tx, postId: string) {
  return tx.select().from(publishJobs).where(eq(publishJobs.postId, postId));
}

export async function insertJobs(
  tx: Tx,
  values: (typeof publishJobs.$inferInsert)[],
) {
  return tx
    .insert(publishJobs)
    .values(values)
    .returning({ id: publishJobs.id });
}

export async function lockJob(tx: Tx, id: string) {
  const [job] = await tx
    .select()
    .from(publishJobs)
    .where(eq(publishJobs.id, id))
    .for("update");
  return job;
}

export async function updateJob(tx: Tx, id: string, patch: PublishJobPatch) {
  const [job] = await tx
    .update(publishJobs)
    .set(patch)
    .where(eq(publishJobs.id, id))
    .returning();
  return job;
}

// Returns false when the lease was lost.
export async function checkpointLeased(
  jobId: string,
  token: string,
  patch: PublishJobPatch,
) {
  const rows = await getDb()
    .update(publishJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(ownedLease(jobId, token))
    .returning({ id: publishJobs.id });
  return rows.length > 0;
}

export async function finishLeased(
  tx: Tx,
  jobId: string,
  token: string,
  patch: PublishJobPatch,
) {
  return tx
    .update(publishJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(ownedLease(jobId, token))
    .returning();
}

// The job as this worker's lease sees it; undefined once the lease is lost.
export async function findLeased(jobId: string, token: string) {
  const [job] = await getDb()
    .select()
    .from(publishJobs)
    .where(ownedLease(jobId, token));
  return job;
}

export async function releaseDispatch(jobId: string) {
  await getDb()
    .update(publishJobs)
    .set({ dispatchAt: new Date() })
    .where(eq(publishJobs.id, jobId));
}

// Jobs due for delivery whose dispatch and lease have both expired.
export async function dueJobIds(
  limit: number,
  {
    projectId,
    waitForAttempt,
  }: { projectId?: string; waitForAttempt: boolean },
) {
  const now = new Date();
  return getDb()
    .select({ id: publishJobs.id })
    .from(publishJobs)
    .where(
      and(
        projectId ? eq(publishJobs.projectId, projectId) : undefined,
        inArray(publishJobs.status, [...activeStatuses]),
        lte(publishJobs.dispatchAt, now),
        waitForAttempt ? lte(publishJobs.nextAttemptAt, now) : undefined,
        or(
          isNull(publishJobs.leaseExpiresAt),
          lte(publishJobs.leaseExpiresAt, now),
        ),
      ),
    )
    .orderBy(asc(publishJobs.dispatchAt))
    .limit(limit);
}

// Requeues the post's failed jobs from scratch; uncertain ones stay put.
export async function resetFailedJobs(tx: Tx, postId: string) {
  const now = new Date();
  return tx
    .update(publishJobs)
    .set({
      status: "queued",
      state: {},
      createdAt: now,
      attempts: 0,
      polls: 0,
      error: null,
      nextAttemptAt: now,
      dispatchAt: now,
    })
    .where(
      and(eq(publishJobs.postId, postId), eq(publishJobs.status, "failed")),
    )
    .returning({ id: publishJobs.id });
}

export async function insertPublication(
  tx: Tx,
  values: typeof postPublications.$inferInsert,
) {
  await tx.insert(postPublications).values(values).onConflictDoNothing();
}

export function listPublications(projectId: string, postId?: string) {
  return getDb()
    .select()
    .from(postPublications)
    .where(
      and(
        eq(postPublications.projectId, projectId),
        postId ? eq(postPublications.postId, postId) : undefined,
      ),
    )
    .orderBy(desc(postPublications.publishedAt));
}

export async function findPublication(projectId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(postPublications)
    .where(
      and(
        eq(postPublications.id, id),
        eq(postPublications.projectId, projectId),
      ),
    );
  return row;
}

export async function updatePublication(
  projectId: string,
  id: string,
  patch: Partial<typeof postPublications.$inferInsert>,
) {
  const [row] = await getDb()
    .update(postPublications)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(postPublications.id, id),
        eq(postPublications.projectId, projectId),
      ),
    )
    .returning();
  return row;
}
