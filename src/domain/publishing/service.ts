import "server-only";
import { loggedOperation } from "@/lib/logger";
import type { PostDto } from "@/shared/schemas/post";
import type { PublicationDto } from "@/shared/schemas/publication";
import type {
  EditPublicationInput,
  ListPublicationsInput,
  PublicationRef,
  PublishPostInput,
} from "@/shared/schemas/publishing";
import { isOwnedProject, lockOwnedProject } from "../projects/system";
import type { Actor } from "../shared/actor";
import { UserFacingError } from "../shared/errors";
import { scheduleDispatch } from "./jobs";
import { listForProject, manage } from "./publications";
import { enqueue, retryFailed } from "./rules";

// User use cases. Publishing authorizes once, when the user asks: the jobs
// it creates are then run by the worker (system.ts) without a user.

const projectNotFound = () => new UserFacingError("Project not found", 404);
async function assertOwned(actor: Actor, projectId: string) {
  if (!(await isOwnedProject(actor.userId, projectId))) throw projectNotFound();
}

// Queues the post for every selected network; delivery continues after
// the response, so the returned post is still publishing.
export async function publishPost(
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

export async function retryPublication(
  actor: Actor,
  { projectId, id }: PublishPostInput,
): Promise<void> {
  return loggedOperation(
    "domain.publishing.retry",
    { ...actor, projectId, postId: id },
    async () => {
      const jobIds = await retryFailed(projectId, id, async (tx) => {
        if (!(await lockOwnedProject(tx, actor.userId, projectId)))
          throw projectNotFound();
      });
      await scheduleDispatch(jobIds);
    },
  );
}

export async function listPublications(
  actor: Actor,
  { projectId, postId }: ListPublicationsInput,
): Promise<PublicationDto[]> {
  await assertOwned(actor, projectId);
  return listForProject(projectId, postId);
}

export async function refreshPublication(
  actor: Actor,
  { projectId, id }: PublicationRef,
): Promise<PublicationDto> {
  await assertOwned(actor, projectId);
  return manage(projectId, id, { type: "refresh" });
}

export async function editPublication(
  actor: Actor,
  { projectId, id, caption }: EditPublicationInput,
): Promise<PublicationDto> {
  await assertOwned(actor, projectId);
  return manage(projectId, id, { type: "edit", caption });
}

export async function deletePublication(
  actor: Actor,
  { projectId, id }: PublicationRef,
): Promise<PublicationDto> {
  await assertOwned(actor, projectId);
  return manage(projectId, id, { type: "delete" });
}
