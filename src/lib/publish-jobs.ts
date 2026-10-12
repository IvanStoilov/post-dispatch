import { loggedOperation } from "./logger";
import { randomUUID } from "node:crypto";
import { asc, and, eq, inArray, lte, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  posts,
  publishJobs,
  postPublications,
  type PublishJob,
} from "../db/schema";
import { hydrate, toPost } from "./store";
import { getProject, isConnected } from "./projects";
import { connectors } from "./connectors/registry";
import { MediaPending, type PublishState } from "./connectors/types";
import { reconcileSubmission } from "./connectors/reconcile";
import { publicationImageUrl } from "./storage";
import { logger, redact, withLogContext } from "./logger";
import { createQueue, queueDriver } from "./queue";

const active = ["queued", "preparing", "waiting", "submitting"] as const;
const leaseSeconds = 600;
const now = () => new Date();
const later = (seconds: number) => new Date(Date.now() + seconds * 1000);
const messageSchema = z.object({ jobId: z.uuid() }).strict();
export const publishingQueue = createQueue<{ jobId: string }>(
  "publishing",
  async (message) => processPublishingJob(messageSchema.parse(message).jobId),
);

export async function enqueuePublication(projectId: string, postId: string) {
  return loggedOperation(
    "lib.publish-jobs.enqueuePublication",
    { projectId, postId },
    async () => {
      z.uuid().parse(projectId);
      z.uuid().parse(postId);
      const project = await getProject(projectId);
      return getDb().transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(posts)
          .where(and(eq(posts.id, postId), eq(posts.projectId, projectId)))
          .for("update");
        if (!row) throw new Error("Post not found");
        if (row.status !== "draft") {
          // Repeated clicks are idempotent, but never reset an uncertain submission.
          const existing = await tx
            .select({ id: publishJobs.id })
            .from(publishJobs)
            .where(eq(publishJobs.postId, postId));
          if (existing.length)
            return {
              post: toPost((await hydrate([row], tx))[0]),
              jobIds: existing.map((j) => j.id),
            };
          throw new Error(
            "This post has already been submitted. Check its publishing status.",
          );
        }
        const [media] = await hydrate([row], tx);
        for (const platform of row.platforms) {
          const connection = project.connections.find(
            (c) => c.provider === platform,
          );
          if (!connection || !isConnected(connection))
            throw new Error(`Connect ${platform} before publishing`);
          const capability = connectors[platform].capabilities;
          const count = media.assets.length || (row.imageUrl ? 1 : 0);
          if (!capability.text && !count)
            throw new Error(`${platform} requires media`);
          if (count > capability.images)
            throw new Error(`Too many images for ${platform}`);
          if (
            media.assets.some((a) => a.kind === "VIDEO") &&
            (!capability.video || count !== 1)
          )
            throw new Error(`Unsupported video combination for ${platform}`);
          if (platform === "linkedin" && !media.assets.length && row.imageUrl)
            throw new Error(
              "Re-upload the media before publishing to LinkedIn",
            );
        }
        const [claimed] = await tx
          .update(posts)
          .set({ status: "publishing", error: null, updatedAt: sql`now()` })
          .where(eq(posts.id, postId))
          .returning();
        const post = toPost({ ...media, ...claimed });
        const jobs = await tx
          .insert(publishJobs)
          .values(
            row.platforms.map((platform) => ({
              postId,
              projectId,
              platform,
              accountId: project.connections.find(
                (c) => c.provider === platform,
              )!.accountId,
              snapshot: {
                post,
                assets: media.assets,
                externalUrl: row.imageUrl,
              },
            })),
          )
          .returning({ id: publishJobs.id });
        return { post, jobIds: jobs.map((j) => j.id) };
      });
    },
  );
}

function ownedLease(jobId: string, token: string) {
  return and(
    eq(publishJobs.id, jobId),
    eq(publishJobs.leaseToken, token),
    sql`${publishJobs.leaseExpiresAt} > now()`,
  );
}
async function checkpoint(
  jobId: string,
  token: string,
  patch: Partial<typeof publishJobs.$inferInsert>,
) {
  const rows = await getDb()
    .update(publishJobs)
    .set({ ...patch, updatedAt: now() })
    .where(ownedLease(jobId, token))
    .returning({ id: publishJobs.id });
  if (!rows.length) throw new Error("Publishing job lease was lost");
  logger.debug("publishing.job.checkpoint", {
    jobId,
    phase: patch.status,
    attempts: patch.attempts,
    polls: patch.polls,
    nextAttemptAt: patch.nextAttemptAt,
    mediaIds: patch.state?.mediaIds,
    containerId: patch.state?.containerId,
    videoId: patch.state?.videoId,
  });
}

// Serialize channel rollups on the post, so simultaneous completions cannot
// leave the post publishing after all destinations have completed.
async function finishJob(
  job: PublishJob,
  token: string,
  status: "published" | "failed" | "needs_review",
  error?: string,
  remoteId?: string,
) {
  await getDb().transaction(async (tx) => {
    await tx
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.id, job.postId))
      .for("update");
    const updated = await tx
      .update(publishJobs)
      .set({
        status,
        error: error || null,
        remoteId: remoteId || null,
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now(),
      })
      .where(ownedLease(job.id, token))
      .returning();
    if (!updated.length) throw new Error("Publishing job lease was lost");
    if (status === "published" && remoteId) {
      const assets = job.snapshot.assets;
      await tx
        .insert(postPublications)
        .values({
          projectId: job.projectId,
          postId: job.postId,
          platform: job.platform,
          accountId: job.accountId,
          remotePostId: remoteId,
          caption: job.snapshot.post.caption,
          mediaKind: assets.some((a) => a.kind === "VIDEO")
            ? "VIDEO"
            : assets.length > 1
              ? "CAROUSEL"
              : assets.length || job.snapshot.externalUrl
                ? "IMAGE"
                : "TEXT",
          publishedAt: now(),
          permalink:
            job.platform === "linkedin"
              ? `https://www.linkedin.com/feed/update/${encodeURIComponent(remoteId)}/`
              : null,
        })
        .onConflictDoNothing();
    }

    const jobs = await tx
      .select()
      .from(publishJobs)
      .where(eq(publishJobs.postId, job.postId));
    const results = Object.fromEntries(
      jobs
        .filter((j) => j.status === "published" && j.remoteId)
        .map((j) => [j.platform, j.remoteId]),
    );
    const pending = jobs.some((j) =>
      active.includes(j.status as (typeof active)[number]),
    );
    const successful = jobs.every((j) => j.status === "published");
    const errors = jobs
      .filter((j) => j.error && ["failed", "needs_review"].includes(j.status))
      .map((j) => `${j.platform}: ${j.error}`);
    await tx
      .update(posts)
      .set({
        results,
        status: pending
          ? "publishing"
          : successful
            ? "published"
            : "needs_review",
        error: errors.join(" ") || null,
        updatedAt: sql`now()`,
      })
      .where(eq(posts.id, job.postId));
  });
  logger.log(
    status === "published" ? "info" : "warn",
    "publishing.job.finished",
    {
      jobId: job.id,
      projectId: job.projectId,
      postId: job.postId,
      provider: job.platform,
      phase: status,
      remoteId,
    },
  );
}

export async function processPublishingJob(jobId: string) {
  return loggedOperation(
    "lib.publish-jobs.processPublishingJob",
    { jobId },
    async () => {
      z.uuid().parse(jobId);
      const token = randomUUID();
      const job = await getDb().transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(publishJobs)
          .where(eq(publishJobs.id, jobId))
          .for("update");
        if (
          !row ||
          !active.includes(row.status as (typeof active)[number]) ||
          row.nextAttemptAt > now()
        )
          return;
        if (row.leaseExpiresAt && row.leaseExpiresAt > now())
          throw new Error(
            "Publishing job is already leased; retry delivery later",
          );
        const [claimed] = await tx
          .update(publishJobs)
          .set({
            leaseToken: token,
            leaseExpiresAt: later(leaseSeconds),
            attempts:
              row.attempts +
              (row.leaseToken && row.status !== "submitting" ? 1 : 0),
            status: row.status === "submitting" ? "submitting" : "preparing",
            updatedAt: now(),
          })
          .where(eq(publishJobs.id, jobId))
          .returning();
        return claimed;
      });
      if (!job) {
        logger.debug("publishing.job.skipped", {
          jobId,
          reason: "Missing, complete, or not due",
        });
        return;
      }
      logger.debug("publishing.job.claimed", {
        jobId,
        projectId: job.projectId,
        postId: job.postId,
        provider: job.platform,
        phase: job.status,
        attempts: job.attempts,
        polls: job.polls,
      });
      await withLogContext(
        {
          projectId: job.projectId,
          postId: job.postId,
          jobId,
          provider: job.platform,
        },
        async () => {
          const signal = AbortSignal.timeout(240000);
          let secrets: string[] = [];
          try {
            const project = await getProject(job.projectId);
            const connection = project.connections.find(
              (c) =>
                c.provider === job.platform && c.accountId === job.accountId,
            );
            if (!connection || !isConnected(connection)) {
              await finishJob(
                job,
                token,
                job.status === "submitting" ? "needs_review" : "failed",
                "The original account is disconnected or expired. Reconnect it before retrying.",
              );
              return;
            }
            secrets = [connection.accessToken];
            if (job.status === "submitting") {
              const evidence = await reconcileSubmission(
                connection,
                job.state,
                signal,
              );
              await finishJob(job, token, "needs_review", evidence);
              return;
            }
            if (
              job.attempts >= 5 ||
              Date.now() - job.createdAt.getTime() > 24 * 3600000
            ) {
              await finishJob(
                job,
                token,
                "failed",
                "Preparation exceeded its retry or time limit. Review the connection and media before retrying.",
              );
              return;
            }
            const urls: string[] = [];
            for (const asset of job.snapshot.assets)
              urls.push(await publicationImageUrl(asset));
            if (!urls.length && job.snapshot.externalUrl)
              urls.push(job.snapshot.externalUrl);
            const progress = {
              state: job.state,
              checkpoint: async (state: PublishState) =>
                checkpoint(job.id, token, { state }),
              beforeSubmit: async () =>
                checkpoint(job.id, token, {
                  status: "submitting",
                  error: null,
                }),
            };
            const remoteId = await connectors[job.platform].publish({
              connection,
              post: job.snapshot.post,
              assets: job.snapshot.assets,
              urls,
              signal,
              progress,
            });
            await finishJob(job, token, "published", undefined, remoteId);
          } catch (error) {
            // Read durable phase, not an in-memory flag: submission may have started
            // before a timeout or before writing its response failed.
            const [current] = await getDb()
              .select()
              .from(publishJobs)
              .where(ownedLease(job.id, token));
            if (!current) throw error;
            const description = String(
              redact(
                error instanceof Error ? error.message : "Publishing failed",
                secrets,
              ),
            );
            logger.log(
              error instanceof MediaPending && current.status !== "submitting"
                ? "debug"
                : "warn",
              error instanceof MediaPending && current.status !== "submitting"
                ? "publishing.job.waiting"
                : "publishing.job.failure",
              {
                jobId,
                platform: job.platform,
                phase: current.status,
                error: description,
              },
            );
            if (current.status === "submitting") {
              let evidence =
                "Outcome uncertain. Check the account before taking further action.";
              try {
                const project = await getProject(job.projectId);
                const connection = project.connections.find(
                  (c) =>
                    c.provider === job.platform &&
                    c.accountId === job.accountId,
                );
                if (connection)
                  evidence = await reconcileSubmission(
                    connection,
                    current.state,
                    AbortSignal.timeout(30000),
                  );
              } catch (error) {
                logger.warn("publishing.reconciliation.failure", {
                  error: redact(error, secrets),
                });
                evidence =
                  "Reconciliation was unavailable. Check the account; automatic resubmission is blocked.";
              }
              await finishJob(
                job,
                token,
                "needs_review",
                `${evidence} ${description}`,
              );
            } else if (
              error instanceof MediaPending &&
              current.polls < 120 &&
              Date.now() - job.createdAt.getTime() < 24 * 3600000
            ) {
              await checkpoint(job.id, token, {
                status: "waiting",
                polls: current.polls + 1,
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: later(error.delaySeconds),
                dispatchAt: now(),
              });
            } else if (
              !(error instanceof MediaPending) &&
              current.attempts < 4
            ) {
              await checkpoint(job.id, token, {
                status: "queued",
                attempts: current.attempts + 1,
                error: description,
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: later(Math.min(900, 30 * 2 ** current.attempts)),
                dispatchAt: now(),
              });
            } else {
              await finishJob(job, token, "failed", description);
            }
          }
        },
      );
      await dispatchPublishingJob(jobId);
    },
  );
}

// Reserving dispatch in the DB closes the commit/enqueue gap. If sending fails
// or this process dies, recovery re-enqueues the row after its dispatch lease.
export async function dispatchPublishingJob(jobId: string) {
  return loggedOperation(
    "lib.publish-jobs.dispatchPublishingJob",
    { jobId },
    async () => {
      const local = queueDriver() === "local";
      const job = await getDb().transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(publishJobs)
          .where(eq(publishJobs.id, jobId))
          .for("update");
        if (
          !row ||
          !active.includes(row.status as (typeof active)[number]) ||
          row.dispatchAt > now() ||
          (row.leaseExpiresAt && row.leaseExpiresAt > now()) ||
          (local && row.nextAttemptAt > now())
        )
          return;
        await tx
          .update(publishJobs)
          .set({
            dispatchAt: new Date(
              Math.max(Date.now(), row.nextAttemptAt.getTime()) +
                leaseSeconds * 1000,
            ),
          })
          .where(eq(publishJobs.id, jobId));
        return row;
      });
      if (!job) return;
      try {
        await publishingQueue.send(
          { jobId },
          {
            delaySeconds: Math.max(
              0,
              Math.ceil((job.nextAttemptAt.getTime() - Date.now()) / 1000),
            ),
          },
        );
      } catch (error) {
        await getDb()
          .update(publishJobs)
          .set({ dispatchAt: now() })
          .where(eq(publishJobs.id, jobId));
        logger.warn("publishing.dispatch.failure", {
          jobId,
          error: redact(error),
        });
      }
    },
  );
}

export async function recoverPublishingJobs(limit = 20, projectId?: string) {
  return loggedOperation(
    "lib.publish-jobs.recoverPublishingJobs",
    { projectId },
    async () => {
      // Older synchronous publishing can have been interrupted before jobs existed.
      await getDb()
        .update(posts)
        .set({
          status: "needs_review",
          error:
            "An older publishing request was interrupted. Check the selected accounts before resubmitting.",
          updatedAt: sql`now()`,
        })
        .where(
          and(
            projectId ? eq(posts.projectId, projectId) : undefined,
            eq(posts.status, "publishing"),
            sql`${posts.updatedAt} < now() - interval '10 minutes'`,
            sql`NOT EXISTS (SELECT 1 FROM publish_jobs WHERE publish_jobs.post_id = ${posts.id})`,
          ),
        );
      // Jobs persist beyond queue message TTL. Recovery is independent of browser
      // polling and can be called repeatedly or concurrently.
      const jobs = await getDb()
        .select({ id: publishJobs.id })
        .from(publishJobs)
        .where(
          and(
            projectId ? eq(publishJobs.projectId, projectId) : undefined,
            inArray(publishJobs.status, [...active]),
            lte(publishJobs.dispatchAt, now()),
            queueDriver() === "local"
              ? lte(publishJobs.nextAttemptAt, now())
              : undefined,
            or(
              isNull(publishJobs.leaseExpiresAt),
              lte(publishJobs.leaseExpiresAt, now()),
            ),
          ),
        )
        .orderBy(asc(publishJobs.dispatchAt))
        .limit(limit);
      logger.debug("publishing.recovery.scan", {
        jobCount: jobs.length,
        limit,
        driver: queueDriver(),
      });
      for (const job of jobs) await dispatchPublishingJob(job.id);
      return jobs.length;
    },
  );
}

export async function retryFailedPublication(
  projectId: string,
  postId: string,
) {
  return loggedOperation(
    "lib.publish-jobs.retryFailedPublication",
    { projectId, postId },
    async () => {
      return getDb().transaction(async (tx) => {
        const [post] = await tx
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.id, z.uuid().parse(postId)),
              eq(posts.projectId, z.uuid().parse(projectId)),
            ),
          )
          .for("update");
        if (!post || post.status !== "needs_review")
          throw new Error("No failed publication to retry");
        const jobs = await tx
          .update(publishJobs)
          .set({
            status: "queued",
            state: {},
            createdAt: now(),
            attempts: 0,
            polls: 0,
            error: null,
            nextAttemptAt: now(),
            dispatchAt: now(),
          })
          .where(
            and(
              eq(publishJobs.postId, postId),
              eq(publishJobs.status, "failed"),
            ),
          )
          .returning({ id: publishJobs.id });
        if (!jobs.length)
          throw new Error(
            "Uncertain submissions cannot be retried automatically. Check the accounts first.",
          );
        await tx
          .update(posts)
          .set({ status: "publishing", updatedAt: sql`now()` })
          .where(eq(posts.id, postId));
        return jobs.map((j) => j.id);
      });
    },
  );
}
