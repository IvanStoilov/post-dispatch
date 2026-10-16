import "server-only";
import type { AssetInput } from "@/shared/schemas/asset";
import type { DraftFields } from "@/shared/schemas/post";
import { toPostDto } from "./mappers";
import * as repository from "./repository";
import { createDraft, deletePost, editDraft, type Authorize } from "./rules";

// For workers and other modules, never for routers or the UI. These take a
// project the caller has already authorized (publishing jobs, MCP tools and
// legacy routes until they migrate) and may return internal records.

export { toPostDto } from "./mappers";
export { validateAssetKinds } from "./rules";
export { hydrate as hydratePosts } from "./repository";
export type { PostRecord } from "./types";

// Publishing state, written by the publishing module.
export {
  lockById as lockPostById,
  lockInProject as lockPost,
  markOrphanedPublishing,
  setPublishingState,
} from "./repository";

type Draft = Omit<DraftFields, "assets"> & { assets?: AssetInput[] };
const preauthorized: Authorize = async () => {};

export async function listProjectPosts(projectId: string) {
  const rows = await repository.listByProject(projectId);
  return (await repository.hydrate(rows)).map(toPostDto);
}

export async function createProjectPost(
  projectId: string,
  draft: Draft,
  options: { allowMissingMedia?: boolean } = {},
) {
  return toPostDto(
    await createDraft(projectId, draft, {
      ...options,
      authorize: preauthorized,
    }),
  );
}

export async function editProjectPost(
  projectId: string,
  id: string,
  draft: Draft,
) {
  return toPostDto(
    await editDraft(projectId, id, draft, { authorize: preauthorized }),
  );
}

export function deleteProjectPost(projectId: string, id: string) {
  return deletePost(projectId, id, { authorize: preauthorized });
}

// The post with its stored media locations, for the media download routes.
export async function findPostRecord(projectId: string, id: string) {
  const row = await repository.findInProject(projectId, id);
  return row ? (await repository.hydrate([row]))[0] : undefined;
}
