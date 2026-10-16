import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import type { PublishJob } from "@/db/schema";
import { reconcileSubmission } from "@/lib/connectors/reconcile";
import { connectors } from "@/lib/connectors/registry";
import { MediaPending, type PublishState } from "@/lib/connectors/types";
import { loggedOperation, logger, redact, withLogContext } from "@/lib/logger";
import { createQueue, queueDriver } from "@/lib/queue";
import { getAssetUrl } from "@/lib/storage";
import {
  lockPostById,
  markOrphanedPublishing,
  setPublishingState,
} from "../posts/system";
import { findProjectRecord, isConnected } from "../projects/system";
import * as repository from "./repository";
import {
  isActive,
  later,
  leaseSeconds,
  maxJobAgeMs,
  maxMediaPolls,
  maxPreparationAttempts,
  publishedCopy,
  retryDelaySeconds,
  rollup,
} from "./rules";
import type { PublishJobPatch } from "./types";

// Durable publishing: one job per post and network, delivered through the
// queue, claimed with a lease, checkpointed before anything irreversible,
// and reconciled when a submission's outcome is unknown.

const now = () => new Date();
const messageSchema = z.object({ jobId: z.uuid() }).strict();
export const publishingQueue = createQueue<{ jobId: string }>(
  "publishing",
  async (message) => processPublishingJob(messageSchema.parse(message).jobId),
);

async function checkpoint(
  jobId: string,
  token: string,
  patch: PublishJobPatch,
) {
  if (!(await repository.checkpointLeased(jobId, token, patch)))
    throw new Error("Publishing job lease was lost");
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
    await lockPostById(tx, job.postId);
    const updated = await repository.finishLeased(tx, job.id, token, {
      status,
      error: error || null,
      remoteId: remoteId || null,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    if (!updated.length) throw new Error("Publishing job lease was lost");
    if (status === "published" && remoteId)
      await repository.insertPublication(tx, publishedCopy(job, remoteId));
    await setPublishingState(
      tx,
      job.postId,
      rollup(await repository.jobsForPost(tx, job.postId)),
    );
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

async function connectionFor(job: PublishJob) {
  const project = await findProjectRecord(job.projectId);
  if (!project) throw new Error("Project not found");
  return project.connections.find(
    (c) => c.provider === job.platform && c.accountId === job.accountId,
  );
}

export async function processPublishingJob(jobId: string) {
  return loggedOperation(
    "domain.publishing.processJob",
    { jobId },
    async () => {
      z.uuid().parse(jobId);
      const token = randomUUID();
      const job = await getDb().transaction(async (tx) => {
        const row = await repository.lockJob(tx, jobId);
        if (!row || !isActive(row.status) || row.nextAttemptAt > now()) return;
        if (row.leaseExpiresAt && row.leaseExpiresAt > now())
          throw new Error(
            "Publishing job is already leased; retry delivery later",
          );
        return repository.updateJob(tx, jobId, {
          leaseToken: token,
          leaseExpiresAt: later(leaseSeconds),
          attempts:
            row.attempts +
            (row.leaseToken && row.status !== "submitting" ? 1 : 0),
          status: row.status === "submitting" ? "submitting" : "preparing",
          updatedAt: now(),
        });
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
            const connection = await connectionFor(job);
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
              job.attempts >= maxPreparationAttempts ||
              Date.now() - job.createdAt.getTime() > maxJobAgeMs
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
              urls.push(await getAssetUrl(asset));
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
            const current = await repository.findLeased(job.id, token);
            if (!current) throw error;
            const description = String(
              redact(
                error instanceof Error ? error.message : "Publishing failed",
                secrets,
              ),
            );
            const waiting =
              error instanceof MediaPending && current.status !== "submitting";
            logger.log(
              waiting ? "debug" : "warn",
              waiting ? "publishing.job.waiting" : "publishing.job.failure",
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
                const connection = await connectionFor(job);
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
              current.polls < maxMediaPolls &&
              Date.now() - job.createdAt.getTime() < maxJobAgeMs
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
              current.attempts < maxPreparationAttempts - 1
            ) {
              await checkpoint(job.id, token, {
                status: "queued",
                attempts: current.attempts + 1,
                error: description,
                leaseToken: null,
                leaseExpiresAt: null,
                nextAttemptAt: later(retryDelaySeconds(current.attempts)),
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
    "domain.publishing.dispatchJob",
    { jobId },
    async () => {
      const local = queueDriver() === "local";
      const job = await getDb().transaction(async (tx) => {
        const row = await repository.lockJob(tx, jobId);
        if (
          !row ||
          !isActive(row.status) ||
          row.dispatchAt > now() ||
          (row.leaseExpiresAt && row.leaseExpiresAt > now()) ||
          (local && row.nextAttemptAt > now())
        )
          return;
        await repository.updateJob(tx, jobId, {
          dispatchAt: new Date(
            Math.max(Date.now(), row.nextAttemptAt.getTime()) +
              leaseSeconds * 1000,
          ),
        });
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
        await repository.releaseDispatch(jobId);
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
    "domain.publishing.recoverJobs",
    { projectId },
    async () => {
      // Older synchronous publishing can have been interrupted before jobs existed.
      await markOrphanedPublishing(projectId);
      // Jobs persist beyond queue message TTL. Recovery is independent of browser
      // polling and can be called repeatedly or concurrently.
      const jobs = await repository.dueJobIds(limit, {
        projectId,
        waitForAttempt: queueDriver() === "local",
      });
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

// Hands new jobs to the queue after the response is sent; outside a
// request (scripts, tests) they are dispatched right away. Recovery picks
// up anything that never reaches the queue.
export async function scheduleDispatch(jobIds: string[]) {
  const dispatch = async () => {
    for (const id of jobIds) await dispatchPublishingJob(id);
  };
  try {
    after(dispatch);
  } catch {
    await dispatch();
  }
}
