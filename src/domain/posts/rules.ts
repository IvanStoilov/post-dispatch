import "server-only";
import { getDb } from "@/db";
import { logger } from "@/lib/logger";
import {
  downloadAsset,
  MediaInputError,
  removeImage,
  storeAsset,
} from "@/lib/storage";
import type { StoredAsset } from "@/lib/types";
import { claimImageUpload } from "@/lib/uploads";
import type { AssetInput } from "@/shared/schemas/asset";
import type { DraftFields } from "@/shared/schemas/post";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import * as repository from "./repository";
import type { PostRecord } from "./types";

// Business rules shared by user use cases (service.ts) and pre-authorized
// callers (system.ts). They differ only in `authorize`, which runs first in
// every write transaction: user use cases lock the actor's project there.
export type Authorize = (tx: Tx) => Promise<void>;
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

export function validateAssetKinds(assets: { kind: "IMAGE" | "VIDEO" }[]) {
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
export async function createDraft(
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
        const row = await repository.insert(tx, projectId, draftValues(draft));
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
export async function editDraft(
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
export async function deletePost(
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
