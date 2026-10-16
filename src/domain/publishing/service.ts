import "server-only";
import { getDb } from "@/db";
import type { PostRow } from "@/db/schema";
import { connectors } from "@/lib/connectors/registry";
import { loggedOperation } from "@/lib/logger";
import type { StoredAsset } from "@/lib/types";
import type { PostDto } from "@/shared/schemas/post";
import type { PublicationDto } from "@/shared/schemas/publication";
import type {
  EditPublicationInput,
  ListPublicationsInput,
  PublicationRef,
  PublishPostInput,
} from "@/shared/schemas/publishing";
import { postsSystemService as posts } from "../posts";
import {
  projectsSystemService as projects,
  type ProjectRecord,
} from "../projects";
import type { Actor } from "../shared/actor";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import {
  dispatchPublishingJob,
  processPublishingJob,
  publishingQueue,
  recoverPublishingJobs,
  scheduleDispatch,
} from "./jobs";
import { toPublicationDto } from "./mappers";
import { listForProject, manage } from "./publications";
import * as repository from "./repository";

// Business logic for publishing. Publishing authorizes once, when the user
// asks: the jobs it creates are then run by the worker (jobs.ts) without a
// user. Both services are exported as objects at the bottom.

// Every selected network must be connected and accept the post's media.
function assertPublishable(
  project: ProjectRecord,
  post: PostRow,
  assets: StoredAsset[],
) {
  const invalid = (message: string) => new UserFacingError(message, 400);
  for (const platform of post.platforms) {
    const connection = project.connections.find((c) => c.provider === platform);
    if (!connection || !projects.isConnected(connection))
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

// Creates one job per selected network and moves the post to publishing.
// Repeated clicks are idempotent: they return the existing jobs, and an
// uncertain submission is never reset. Callers dispatch the returned jobs.
async function enqueue(
  actor: Actor,
  { projectId, id: postId }: { projectId: string; id: string },
) {
  const project = await projects.findOwnedRecord(actor.userId, projectId);
  if (!project) throw new UserFacingError("Project not found", 404);
  const authorization = {
    userId: actor.userId,
    authorizedAt: new Date().toISOString(),
    source: "user_publish" as const,
  };
  return getDb().transaction(async (tx) => {
    // Hold the project like other writes, so deletion can't interleave.
    if (!(await projects.lockOwned(tx, actor.userId, projectId)))
      throw new UserFacingError("Project not found", 404);
    const row = await posts.lockPost(tx, projectId, postId);
    if (!row) throw new UserFacingError("Post not found", 404);
    if (row.status !== "draft") {
      const existing = await repository.jobIdsForPost(tx, postId);
      if (existing.length)
        return {
          post: posts.toPostDto((await posts.hydrate([row], tx))[0]),
          jobIds: existing.map((j) => j.id),
        };
      throw new UserFacingError(
        "This post has already been submitted. Check its publishing status.",
        409,
      );
    }
    const [media] = await posts.hydrate([row], tx);
    assertPublishable(project, row, media.assets);
    const claimed = await posts.setPublishingState(tx, postId, {
      status: "publishing",
      error: null,
    });
    const post = posts.toPostDto({ ...media, ...claimed });
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
async function retryFailed(
  projectId: string,
  postId: string,
  authorize: (tx: Tx) => Promise<void>,
) {
  return getDb().transaction(async (tx) => {
    await authorize(tx);
    const post = await posts.lockPost(tx, projectId, postId);
    if (!post || post.status !== "needs_review")
      throw new UserFacingError("No failed publication to retry", 409);
    const jobs = await repository.resetFailedJobs(tx, postId);
    if (!jobs.length)
      throw new UserFacingError(
        "Uncertain submissions cannot be retried automatically. Check the accounts first.",
        409,
      );
    await posts.setPublishingState(tx, postId, { status: "publishing" });
    return jobs.map((j) => j.id);
  });
}

// User use cases.

const projectNotFound = () => new UserFacingError("Project not found", 404);
async function assertOwned(actor: Actor, projectId: string) {
  if (!(await projects.isOwned(actor.userId, projectId)))
    throw projectNotFound();
}

// Queues the post for every selected network; delivery continues after
// the response, so the returned post is still publishing.
async function publish(
  actor: Actor,
  input: PublishPostInput,
): Promise<PostDto> {
  return loggedOperation(
    "domain.publishing.publish",
    { ...actor, projectId: input.projectId, postId: input.id },
    async () => {
      const { post, jobIds } = await enqueue(actor, input);
      await scheduleDispatch(jobIds);
      return post;
    },
  );
}

async function retry(
  actor: Actor,
  { projectId, id }: PublishPostInput,
): Promise<void> {
  return loggedOperation(
    "domain.publishing.retry",
    { ...actor, projectId, postId: id },
    async () => {
      const jobIds = await retryFailed(projectId, id, async (tx) => {
        if (!(await projects.lockOwned(tx, actor.userId, projectId)))
          throw projectNotFound();
      });
      await scheduleDispatch(jobIds);
    },
  );
}

async function listPublications(
  actor: Actor,
  { projectId, postId }: ListPublicationsInput,
): Promise<PublicationDto[]> {
  await assertOwned(actor, projectId);
  return listForProject(projectId, postId);
}

async function refreshPublication(
  actor: Actor,
  { projectId, id }: PublicationRef,
): Promise<PublicationDto> {
  await assertOwned(actor, projectId);
  return manage(projectId, id, { type: "refresh" });
}

async function editPublication(
  actor: Actor,
  { projectId, id, caption }: EditPublicationInput,
): Promise<PublicationDto> {
  await assertOwned(actor, projectId);
  return manage(projectId, id, { type: "edit", caption });
}

async function deletePublication(
  actor: Actor,
  { projectId, id }: PublicationRef,
): Promise<PublicationDto> {
  await assertOwned(actor, projectId);
  return manage(projectId, id, { type: "delete" });
}

// System operations, for callers that already authorized the project
// (legacy routes and tests, until they migrate).

function retryFailedForProject(projectId: string, postId: string) {
  return retryFailed(projectId, postId, async () => {});
}

function manageForProject(
  projectId: string,
  id: string,
  action: "refresh" | "edit" | "delete",
  caption?: string,
) {
  return manage(
    projectId,
    id,
    action === "edit" ? { type: "edit", caption: caption! } : { type: action },
  );
}

// Deletes the projects' jobs in the caller's transaction (project and
// account deletion). Refuses while a network may be receiving a post:
// deleting then could lose track of a publication. Published copies cascade
// with their posts.
async function deleteJobsInProjects(
  tx: Tx,
  projectIds: string[],
  deleting: "this project" | "your account",
) {
  const jobs = await repository.lockJobsInProjects(tx, projectIds);
  if (
    jobs.some(
      (job) =>
        job.status === "submitting" ||
        (job.leaseExpiresAt && job.leaseExpiresAt > new Date()),
    )
  )
    throw new UserFacingError(
      `A publication is currently being processed. Wait for it to finish before deleting ${deleting}. If it remains stuck, contact support.`,
      409,
    );
  await repository.deleteJobsInProjects(tx, projectIds);
}

// For routers, pages and MCP tools acting for a signed-in user.
export const publishingService = {
  publish,
  retry,
  listPublications,
  refreshPublication,
  editPublication,
  deletePublication,
};

// For workers (queue consumer, recovery cron, local worker) and other
// domain modules only: these skip user authorization. Lint forbids them in
// routers and UI.
export const publishingSystemService = {
  queue: publishingQueue,
  processJob: processPublishingJob,
  dispatchJob: dispatchPublishingJob,
  recoverJobs: recoverPublishingJobs,
  // Queues the post without dispatching; the caller dispatches the jobs.
  enqueue,
  retryFailed: retryFailedForProject,
  listForProject,
  manageForProject,
  deleteJobsInProjects,
  toPublicationDto,
};
