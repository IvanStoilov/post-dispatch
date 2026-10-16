import "server-only";
import { loggedOperation } from "@/lib/logger";
import type {
  CreatePostInput,
  ListPostsInput,
  PostDto,
  PostRef,
  UpdatePostInput,
} from "@/shared/schemas/post";
import { isOwnedProject, lockOwnedProject } from "../projects/system";
import type { Actor } from "../shared/actor";
import { UserFacingError } from "../shared/errors";
import { toPostDto } from "./mappers";
import * as repository from "./repository";
import { createDraft, deletePost as deleteDraft, editDraft } from "./rules";
import type { Authorize } from "./rules";

// User use cases. Posts belong to projects, so access means owning the
// project: checked before slow media work, and again under a lock in the
// transaction that writes.

const projectNotFound = () => new UserFacingError("Project not found", 404);
async function assertOwned(actor: Actor, projectId: string) {
  if (!(await isOwnedProject(actor.userId, projectId))) throw projectNotFound();
}
const lockProject =
  (actor: Actor, projectId: string): Authorize =>
  async (tx) => {
    if (!(await lockOwnedProject(tx, actor.userId, projectId)))
      throw projectNotFound();
  };

export async function listPosts(
  actor: Actor,
  { projectId }: ListPostsInput,
): Promise<PostDto[]> {
  return loggedOperation(
    "domain.posts.list",
    { ...actor, projectId },
    async () => {
      await assertOwned(actor, projectId);
      const rows = await repository.listByProject(projectId);
      return (await repository.hydrate(rows)).map(toPostDto);
    },
  );
}

export async function createPost(
  actor: Actor,
  { projectId, ...draft }: CreatePostInput,
): Promise<PostDto> {
  return loggedOperation(
    "domain.posts.create",
    { ...actor, projectId },
    async () => {
      await assertOwned(actor, projectId);
      return toPostDto(
        await createDraft(projectId, draft, {
          authorize: lockProject(actor, projectId),
        }),
      );
    },
  );
}

export async function updatePost(
  actor: Actor,
  { projectId, id, ...draft }: UpdatePostInput,
): Promise<PostDto> {
  return loggedOperation(
    "domain.posts.update",
    { ...actor, projectId, postId: id },
    async () => {
      await assertOwned(actor, projectId);
      return toPostDto(
        await editDraft(projectId, id, draft, {
          authorize: lockProject(actor, projectId),
        }),
      );
    },
  );
}

export async function deletePost(
  actor: Actor,
  { projectId, id }: PostRef,
): Promise<void> {
  return loggedOperation(
    "domain.posts.delete",
    { ...actor, projectId, postId: id },
    () =>
      deleteDraft(projectId, id, { authorize: lockProject(actor, projectId) }),
  );
}
