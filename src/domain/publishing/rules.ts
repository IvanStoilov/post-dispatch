import "server-only";
import { getDb } from "@/db";
import type { PostRow } from "@/db/schema";
import { connectors } from "@/lib/connectors/registry";
import type { StoredAsset } from "@/lib/types";
import {
  hydratePosts,
  lockPost,
  setPublishingState,
  toPostDto,
} from "../posts/system";
import type { ProjectRecord } from "../projects/system";
import {
  findOwnedProjectRecord,
  isConnected,
  lockOwnedProject,
} from "../projects/system";
import type { Actor } from "../shared/actor";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import * as repository from "./repository";
import { activeStatuses } from "./repository";
import type { PublishJob } from "./types";

// Publishing rules shared by user use cases and the worker.

export const leaseSeconds = 600;
export const maxPreparationAttempts = 5;
export const maxJobAgeMs = 24 * 3600000;
export const maxMediaPolls = 120;
// Exponential backoff for preparation failures, capped at 15 minutes.
export const retryDelaySeconds = (attempts: number) =>
  Math.min(900, 30 * 2 ** attempts);
export const later = (seconds: number) => new Date(Date.now() + seconds * 1000);
export const isActive = (status: string) =>
  activeStatuses.includes(status as (typeof activeStatuses)[number]);

// Every selected network must be connected and accept the post's media.
export function assertPublishable(
  project: ProjectRecord,
  post: PostRow,
  assets: StoredAsset[],
) {
  const invalid = (message: string) => new UserFacingError(message, 400);
  for (const platform of post.platforms) {
    const connection = project.connections.find((c) => c.provider === platform);
    if (!connection || !isConnected(connection))
      throw new UserFacingError(`Connect ${platform} before publishing`, 409);
    const capability = connectors[platform].capabilities;
    const count = assets.length || (post.imageUrl ? 1 : 0);
    if (!capability.text && !count) throw invalid(`${platform} requires media`);
    if (count > capability.images)
      throw invalid(`Too many images for ${platform}`);
    if (
      assets.some((a) => a.kind === "VIDEO") &&
      (!capability.video || count !== 1)
    )
      throw invalid(`Unsupported video combination for ${platform}`);
    if (platform === "linkedin" && !assets.length && post.imageUrl)
      throw invalid("Re-upload the media before publishing to LinkedIn");
  }
}

// The post's state once one of its jobs finished: still publishing while
// any job is active, published when all succeeded, otherwise needs review.
export function rollup(jobs: PublishJob[]) {
  const results = Object.fromEntries(
    jobs
      .filter((j) => j.status === "published" && j.remoteId)
      .map((j) => [j.platform, j.remoteId]),
  );
  const pending = jobs.some((j) => isActive(j.status));
  const successful = jobs.every((j) => j.status === "published");
  const errors = jobs
    .filter((j) => j.error && ["failed", "needs_review"].includes(j.status))
    .map((j) => `${j.platform}: ${j.error}`);
  return {
    results,
    status: pending
      ? ("publishing" as const)
      : successful
        ? ("published" as const)
        : ("needs_review" as const),
    error: errors.join(" ") || null,
  };
}

// What went live, for the published copy's record.
export function publishedCopy(job: PublishJob, remoteId: string) {
  const assets = job.snapshot.assets;
  return {
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
    publishedAt: new Date(),
    permalink:
      job.platform === "linkedin"
        ? `https://www.linkedin.com/feed/update/${encodeURIComponent(remoteId)}/`
        : null,
  };
}

// Creates one job per selected network and moves the post to publishing.
// Repeated clicks are idempotent: they return the existing jobs, and an
// uncertain submission is never reset. Callers dispatch the returned jobs.
export async function enqueue(
  actor: Actor,
  { projectId, id: postId }: { projectId: string; id: string },
) {
  const project = await findOwnedProjectRecord(actor.userId, projectId);
  if (!project) throw new UserFacingError("Project not found", 404);
  const authorization = {
    userId: actor.userId,
    authorizedAt: new Date().toISOString(),
    source: "user_publish" as const,
  };
  return getDb().transaction(async (tx) => {
    // Hold the project like other writes, so deletion can't interleave.
    if (!(await lockOwnedProject(tx, actor.userId, projectId)))
      throw new UserFacingError("Project not found", 404);
    const row = await lockPost(tx, projectId, postId);
    if (!row) throw new UserFacingError("Post not found", 404);
    if (row.status !== "draft") {
      const existing = await repository.jobIdsForPost(tx, postId);
      if (existing.length)
        return {
          post: toPostDto((await hydratePosts([row], tx))[0]),
          jobIds: existing.map((j) => j.id),
        };
      throw new UserFacingError(
        "This post has already been submitted. Check its publishing status.",
        409,
      );
    }
    const [media] = await hydratePosts([row], tx);
    assertPublishable(project, row, media.assets);
    const claimed = await setPublishingState(tx, postId, {
      status: "publishing",
      error: null,
    });
    const post = toPostDto({ ...media, ...claimed });
    const jobs = await repository.insertJobs(
      tx,
      row.platforms.map((platform) => ({
        postId,
        projectId,
        platform,
        accountId: project.connections.find((c) => c.provider === platform)!
          .accountId,
        snapshot: {
          authorization,
          post,
          assets: media.assets,
          externalUrl: row.imageUrl,
        },
      })),
    );
    return { post, jobIds: jobs.map((j) => j.id) };
  });
}

// Requeues a post's failed networks. Uncertain submissions need a person
// to check the account first, so they are never retried automatically.
export async function retryFailed(
  projectId: string,
  postId: string,
  authorize: (tx: Tx) => Promise<void>,
) {
  return getDb().transaction(async (tx) => {
    await authorize(tx);
    const post = await lockPost(tx, projectId, postId);
    if (!post || post.status !== "needs_review")
      throw new UserFacingError("No failed publication to retry", 409);
    const jobs = await repository.resetFailedJobs(tx, postId);
    if (!jobs.length)
      throw new UserFacingError(
        "Uncertain submissions cannot be retried automatically. Check the accounts first.",
        409,
      );
    await setPublishingState(tx, postId, { status: "publishing" });
    return jobs.map((j) => j.id);
  });
}
