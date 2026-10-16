import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import type { z } from "zod";
import { postsService, postsSystemService } from "../../src/domain/posts";
import {
  projectsService,
  projectsSystemService,
} from "../../src/domain/projects";
import type { Actor } from "../../src/domain/shared/actor";
import {
  createPostInput,
  submitDraftInput,
  updatePostInput,
} from "../../src/shared/schemas/post";
import { projectFields } from "../../src/shared/schemas/project";

// Fixtures on top of the domain, for tests that set up data directly
// instead of through an API. They act as the project's owner through the
// same use cases the app uses, with inputs parsed like a request body
// (tests may pass invalid drafts on purpose).

// The project's owner. For a missing project, a stranger: the domain then
// refuses as it would for anyone else.
export async function ownerOf(projectId: string): Promise<Actor> {
  const project = await projectsSystemService.findRecord(projectId);
  return { userId: project?.userId ?? randomUUID() };
}

// A project for the user, with any channel settings already applied.
export async function createProject(
  userId: string,
  fields: z.input<typeof projectFields>,
) {
  const actor = { userId };
  const { id } = await projectsService.create(actor, { name: fields.name });
  return projectsService.update(actor, { ...projectFields.parse(fields), id });
}

// The project's internal record, including connection tokens.
export async function projectRecord(id: string) {
  const project = await projectsSystemService.findRecord(id);
  assert.ok(project, `project ${id} exists`);
  return project;
}

// A draft in the project. allowMissingMedia files it as an assistant
// would, so Instagram media may be missing.
export async function createPost(
  projectId: string,
  draft: unknown,
  { allowMissingMedia = false } = {},
) {
  const input = { ...(draft as object), projectId };
  const actor = await ownerOf(projectId);
  return allowMissingMedia
    ? postsService.submitDraft(actor, submitDraftInput.parse(input))
    : postsService.create(actor, createPostInput.parse(input));
}

// Omitted assets keep the post's media; an empty list removes it.
export async function editPost(projectId: string, id: string, draft: unknown) {
  return postsService.update(
    await ownerOf(projectId),
    updatePostInput.parse({ ...(draft as object), projectId, id }),
  );
}

export async function listPosts(projectId: string) {
  return postsService.list(await ownerOf(projectId), { projectId });
}

export async function deletePost(projectId: string, id: string) {
  return postsService.delete(await ownerOf(projectId), { projectId, id });
}

// The post's internal record, including where its media is stored.
export async function postRecord(projectId: string, id: string) {
  const post = await postsSystemService.findRecord(projectId, id);
  assert.ok(post, `post ${id} exists`);
  return post;
}
