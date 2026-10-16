import "server-only";
import { getDb } from "@/db";
import { logger, loggedOperation } from "@/lib/logger";
import {
  downloadAsset,
  getAssetUrl,
  MediaInputError,
  readImage,
  removeImage,
  storeAsset,
} from "@/lib/storage";
import type { StoredAsset } from "@/lib/types";
import { claimImageUpload } from "@/lib/uploads";
import type { AssetInput } from "@/shared/schemas/asset";
import type {
  CreatePostInput,
  DraftFields,
  ListPostsInput,
  PostAssetRef,
  PostDto,
  PostRef,
  UpdatePostInput,
} from "@/shared/schemas/post";
import { projectsSystemService } from "../projects";
import type { Actor } from "../shared/actor";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import { toPostDto } from "./mappers";
import * as repository from "./repository";
import type { PostRecord } from "./types";

// All business logic for posts. User use cases take an Actor; posts belong
// to projects, so access means owning the project. System operations take a
// project the caller already authorized. Both are exported as objects at
// the bottom.

// Shared writes take an `authorize` step that runs first in every write
// transaction: user use cases lock the actor's project there, pre-authorized
// callers pass a no-op.
type Authorize = (tx: Tx) => Promise<void>;
type Draft = Omit<DraftFields, "assets"> & { assets?: AssetInput[] };

const invalid = (message: string) => new UserFacingError(message, 400);
const draftValues = ({ title, caption, platforms, source }: Draft) => ({
  title,
  caption,
  platforms,
  source,
});

// Bad media from the client becomes a user-facing 400 with storage's message.
async function withMediaErrors<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof MediaInputError) throw invalid(error.message);
    throw error;
  }
}

function validateAssetKinds(assets: { kind: "IMAGE" | "VIDEO" }[]) {
  if (assets.length > 10) throw invalid("A post supports up to 10 images");
  if (assets.some((asset) => asset.kind === "VIDEO") && assets.length !== 1)
    throw invalid(
      "Choose up to 10 images or a single video; videos cannot be mixed with images",
    );
}

async function cleanupAssets(assets: StoredAsset[]) {
  for (const asset of assets)
    await removeImage(asset).catch((error) =>
      logger.warn("storage.cleanup.failure", {
        reason: "Could not clean up unused post media",
        error,
      }),
    );
}

// Downloads and stores new media before the transaction (it can take
// minutes). Returns what was stored, for cleanup if the write fails.
async function prepareAssets(projectId: string, assets: AssetInput[] = []) {
  const deadline = Date.now() + 240000;
  const created: StoredAsset[] = [];
  const inputs: (AssetInput | StoredAsset)[] = [];
  try {
    for (const input of assets) {
      let asset: StoredAsset | undefined;
      if (input.type === "EXTERNAL_URL" || input.type === "OPENAPI_FILE")
        asset = await downloadAsset(
          projectId,
          input.type === "EXTERNAL_URL" ? input.url : input.download_url,
          input.kind,
          Math.min(
            deadline,
            Date.now() + (input.kind === "IMAGE" ? 20000 : 120000),
          ),
        );
      if (input.type === "INLINE_BASE64") {
        if (
          !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
            input.dataBase64,
          )
        )
          throw invalid("Invalid base64 image data");
        asset = await storeAsset(
          projectId,
          Buffer.from(input.dataBase64, "base64"),
          "IMAGE",
        );
      }
      if (asset) {
        created.push(asset);
        inputs.push(asset);
      } else inputs.push(input);
    }
    return { created, inputs };
  } catch (error) {
    await cleanupAssets(created);
    throw error;
  }
}

// Turns prepared inputs into the post's final media, claiming uploads and
// reusing the post's existing assets.
async function resolveAssets(
  tx: Tx,
  projectId: string,
  inputs: (AssetInput | StoredAsset)[],
  existing: StoredAsset[] = [],
) {
  const result: StoredAsset[] = [];
  for (const input of inputs) {
    if (!("type" in input)) result.push(input);
    else if (input.type === "UPLOAD_ID") {
      const asset = await claimImageUpload(tx, projectId, input.uploadId);
      if (input.kind && asset.kind !== input.kind)
        throw invalid("Uploaded asset has a different media type");
      result.push(asset);
    } else if (input.type === "EXISTING") {
      const asset = existing.find((asset) => asset.id === input.assetId);
      if (!asset) throw invalid("Existing asset does not belong to this draft");
      result.push(asset);
    } else throw invalid("Asset was not prepared");
  }
  if (new Set(result.map((asset) => asset.id)).size !== result.length)
    throw invalid("Each asset may appear only once in a post");
  validateAssetKinds(result);
  return result;
}

// allowMissingMedia lets assistants file Instagram drafts whose media the
// reviewer adds later; publishing still requires it.
async function createDraft(
  projectId: string,
  draft: Draft,
  options: { authorize: Authorize; allowMissingMedia?: boolean },
): Promise<PostRecord> {
  if (draft.assets?.some((asset) => asset.type === "EXISTING"))
    throw invalid("New posts cannot reference existing assets");
  if (
    !options.allowMissingMedia &&
    draft.platforms.includes("instagram") &&
    !draft.assets?.length
  )
    throw invalid("Instagram requires an image or video");
  return withMediaErrors(async () => {
    const prepared = await prepareAssets(projectId, draft.assets);
    try {
      return await getDb().transaction(async (tx) => {
        await options.authorize(tx);
        const assets = await resolveAssets(tx, projectId, prepared.inputs);
        const row = await repository.createPost(
          tx,
          projectId,
          draftValues(draft),
        );
        await repository.writeAssets(tx, row.id, assets);
        return (await repository.hydrate([row], tx))[0];
      });
    } catch (error) {
      await cleanupAssets(prepared.created);
      throw error;
    }
  });
}

const notEditable = (exists: boolean) =>
  new UserFacingError(
    "Draft not found or no longer editable",
    exists ? 409 : 404,
  );

// Omitted assets keep the current media; an empty list removes it.
async function editDraft(
  projectId: string,
  id: string,
  draft: Draft,
  options: { authorize: Authorize },
): Promise<PostRecord> {
  return withMediaErrors(async () => {
    const existing = await repository.findInProject(projectId, id);
    if (!existing || existing.status !== "draft") throw notEditable(!!existing);
    const prepared = await prepareAssets(projectId, draft.assets);
    let previous: StoredAsset[] = [];
    let updated: PostRecord;
    try {
      updated = await getDb().transaction(async (tx) => {
        await options.authorize(tx);
        const current = await repository.lockInProject(tx, projectId, id);
        if (!current || current.status !== "draft")
          throw notEditable(!!current);
        previous = (await repository.hydrate([current], tx))[0].assets;
        const assets =
          draft.assets === undefined
            ? previous
            : await resolveAssets(tx, projectId, prepared.inputs, previous);
        if (draft.platforms.includes("instagram") && !assets.length)
          throw invalid("Instagram requires an image or video");
        const row = await repository.updateDraft(tx, id, draftValues(draft));
        await repository.writeAssets(tx, row.id, assets, previous);
        return (await repository.hydrate([row], tx))[0];
      });
    } catch (error) {
      await cleanupAssets(prepared.created);
      throw error;
    }
    await cleanupAssets(
      previous.filter(
        (asset) => !updated.assets.some((keep) => keep.id === asset.id),
      ),
    );
    return updated;
  });
}

// Deletes the Ramblo post and its stored media; posts already on a network
// stay there. Not while publishing is in progress.
async function deleteDraft(
  projectId: string,
  id: string,
  options: { authorize: Authorize },
) {
  const media = await getDb().transaction(async (tx) => {
    await options.authorize(tx);
    const row = await repository.lockInProject(tx, projectId, id);
    if (!row || row.status === "publishing")
      throw new UserFacingError(
        "Post not found or currently publishing",
        row ? 409 : 404,
      );
    const [post] = await repository.hydrate([row], tx);
    await repository.remove(tx, id);
    return post.assets;
  });
  await cleanupAssets(media);
}

// User use cases. Posts belong to projects, so access means owning the
// project: checked before slow media work, and again under a lock in the
// transaction that writes.

const projectNotFound = () => new UserFacingError("Project not found", 404);
async function assertOwned(actor: Actor, projectId: string) {
  if (!(await projectsSystemService.isOwned(actor.userId, projectId)))
    throw projectNotFound();
}
const lockProject =
  (actor: Actor, projectId: string): Authorize =>
  async (tx) => {
    if (!(await projectsSystemService.lockOwned(tx, actor.userId, projectId)))
      throw projectNotFound();
  };

async function list(
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

async function create(
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

async function update(
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

async function remove(actor: Actor, { projectId, id }: PostRef): Promise<void> {
  return loggedOperation(
    "domain.posts.delete",
    { ...actor, projectId, postId: id },
    () =>
      deleteDraft(projectId, id, { authorize: lockProject(actor, projectId) }),
  );
}

// Media is private: these serve it to the project's owner only.

const mediaNotFound = () => new UserFacingError("Media not found", 404);
async function ownedRecord(actor: Actor, { projectId, id }: PostRef) {
  await assertOwned(actor, projectId);
  const row = await repository.findInProject(projectId, id);
  if (!row) throw mediaNotFound();
  return (await repository.hydrate([row]))[0];
}
const unavailable = (error: unknown) => {
  logger.warn("storage.media.unavailable", { error });
  return new UserFacingError("Media unavailable", 502);
};

// A short-lived URL for one of the post's stored files.
async function mediaUrl(actor: Actor, ref: PostAssetRef): Promise<string> {
  const post = await ownedRecord(actor, ref);
  const asset = post.assets.find((asset) => asset.id === ref.assetId);
  if (!asset) throw mediaNotFound();
  return getAssetUrl(asset, 300).catch((error) => {
    throw unavailable(error);
  });
}

// The post's preview image (its first image), as JPEG bytes.
async function previewImage(actor: Actor, ref: PostRef) {
  const post = await ownedRecord(actor, ref);
  if (!post.imageKey || !post.imageBucket || !post.storageProvider)
    throw mediaNotFound();
  const bytes = await readImage({
    imageKey: post.imageKey,
    imageBucket: post.imageBucket,
    storageProvider: post.storageProvider,
  }).catch((error) => {
    throw unavailable(error);
  });
  return Buffer.from(bytes);
}

// System operations, for a project the caller already authorized
// (publishing jobs, MCP tools and legacy routes until they migrate).

const preauthorized: Authorize = async () => {};

async function listForProject(projectId: string) {
  const rows = await repository.listByProject(projectId);
  return (await repository.hydrate(rows)).map(toPostDto);
}

async function createForProject(
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

async function editForProject(projectId: string, id: string, draft: Draft) {
  return toPostDto(
    await editDraft(projectId, id, draft, { authorize: preauthorized }),
  );
}

function deleteForProject(projectId: string, id: string) {
  return deleteDraft(projectId, id, { authorize: preauthorized });
}

// The post with its stored media locations, for the media download routes.
async function findRecord(projectId: string, id: string) {
  const row = await repository.findInProject(projectId, id);
  return row ? (await repository.hydrate([row]))[0] : undefined;
}

// Deletes the projects' posts in the caller's transaction (project
// deletion) and returns their stored media for cleanup.
async function deleteInProjects(tx: Tx, projectIds: string[]) {
  const media = await repository.lockMediaInProjects(tx, projectIds);
  await repository.removeInProjects(tx, projectIds);
  return media;
}

// For routers, pages and MCP tools acting for a signed-in user.
export const postsService = {
  list,
  create,
  update,
  delete: remove,
  mediaUrl,
  previewImage,
};

// For workers and other domain modules only: these skip user
// authorization. Lint forbids them in routers and UI.
export const postsSystemService = {
  listForProject,
  createForProject,
  editForProject,
  deleteForProject,
  findRecord,
  deleteInProjects,
  hydrate: repository.hydrate,
  toPostDto,
  validateAssetKinds,
  // Publishing state (status, results, error), written by publishing.
  lockPost: repository.lockInProject,
  lockPostById: repository.lockById,
  setPublishingState: repository.setPublishingState,
  markOrphanedPublishing: repository.markOrphanedPublishing,
};
