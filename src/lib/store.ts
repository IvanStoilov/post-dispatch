import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { posts, postAssets, type PostRow } from "../db/schema";
import type { Platform, Post, StoredAsset } from "./types";
import {
  imageFileSchema,
  uploadImage,
  removeImage,
  storeAsset,
  downloadAsset,
} from "./storage";
import {
  editableAssetSchema,
  validateAssetKinds,
  type AssetInput,
} from "./asset-inputs";
import { randomUUID } from "node:crypto";
import { claimImageUpload } from "./uploads";
const draftFields = z
  .object({
    assets: z.array(editableAssetSchema).max(10).optional(),
    title: z.string().trim().min(1).max(120),
    caption: z.string().trim().min(1).max(2200),
    imageUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .refine(
            (v) => new URL(v).protocol === "https:",
            "Use a publicly accessible HTTPS image URL",
          ),
      ])
      .default(""),
    imageFile: imageFileSchema.optional(),
    imageUploadId: z.uuid().optional(),
    keepImage: z.boolean().default(false),
    platforms: z
      .array(z.enum(["instagram", "facebook"]))
      .min(1)
      .max(2)
      .transform((v) => [...new Set(v)]),
    source: z.string().trim().min(1).max(60).default("Manual"),
  })
  .refine(
    (v) =>
      [
        v.imageUrl,
        v.imageFile,
        v.imageUploadId,
        v.assets?.length ? v.assets : undefined,
      ].filter(Boolean).length <= 1,
    { message: "Provide only one of assets, an image URL, file, or upload" },
  );
export const draftSchema = draftFields.refine(
  (v) =>
    !v.platforms.includes("instagram") ||
    !!v.assets?.length ||
    !!v.imageUrl ||
    !!v.imageFile ||
    !!v.imageUploadId ||
    v.keepImage,
  {
    message: "Instagram requires an image or video",
    path: ["imageUrl"],
  },
);

type MediaPost = PostRow & {
  assets: StoredAsset[];
  imageKey: string | null;
  imageBucket: string | null;
};
export function storedAssets(row: { assets: StoredAsset[] }): StoredAsset[] {
  return row.assets;
}
async function hydrate(
  rows: PostRow[],
  db: ReturnType<typeof getDb> | Tx = getDb(),
): Promise<MediaPost[]> {
  if (!rows.length) return [];
  const media = await db
    .select()
    .from(postAssets)
    .where(
      inArray(
        postAssets.postId,
        rows.map((row) => row.id),
      ),
    )
    .orderBy(asc(postAssets.position));
  const grouped = new Map<string, StoredAsset[]>();
  for (const asset of media) {
    const items = grouped.get(asset.postId) || [];
    items.push({
      id: asset.id,
      kind: asset.kind,
      imageKey: asset.imageKey,
      imageBucket: asset.imageBucket,
      mimeType: asset.mimeType,
    });
    grouped.set(asset.postId, items);
  }
  return rows.map((row) => {
    const assets = grouped.get(row.id) || [];
    const first = assets[0]?.kind === "IMAGE" ? assets[0] : undefined;
    return {
      ...row,
      assets,
      imageKey: first?.imageKey ?? null,
      imageBucket: first?.imageBucket ?? null,
    };
  });
}
function toPost(row: MediaPost): Post {
  const { imageKey, imageBucket, assets: rawAssets, ...safe } = row;
  void imageKey;
  void imageBucket;
  void rawAssets;
  const assets = storedAssets(row).map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    url: `/api/posts/${row.id}/assets/${asset.id}?projectId=${row.projectId}&v=${encodeURIComponent(row.updatedAt)}`,
  }));
  return {
    ...safe,
    assets,
    imageUrl:
      assets[0]?.kind === "IMAGE"
        ? `/api/posts/${row.id}/image?projectId=${row.projectId}&v=${encodeURIComponent(row.updatedAt)}`
        : row.imageUrl,
    createdAt: new Date(row.createdAt).toISOString(),
    error: row.error ?? undefined,
  };
}
async function cleanupAssets(assets: StoredAsset[]) {
  for (const asset of assets)
    await removeImage(asset).catch(() =>
      console.error("Could not clean up unused post media"),
    );
}
type ParsedDraft = z.infer<typeof draftFields>;
async function prepareAssets(projectId: string, data: ParsedDraft) {
  const deadline = Date.now() + 240000;
  const created: StoredAsset[] = [];
  const inputs: (AssetInput | StoredAsset)[] = [];
  try {
    if (data.assets !== undefined) {
      for (const input of data.assets) {
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
            throw new Error("Invalid base64 image data");
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
    } else if (data.imageUrl || data.imageFile) {
      const asset: StoredAsset = {
        id: randomUUID(),
        kind: "IMAGE",
        mimeType: "image/jpeg",
        ...(await uploadImage(projectId, data)),
      };
      created.push(asset);
      inputs.push(asset);
    } else if (data.imageUploadId)
      inputs.push({ type: "UPLOAD_ID", uploadId: data.imageUploadId });
    return { created, inputs };
  } catch (error) {
    await cleanupAssets(created);
    throw error;
  }
}
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
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
        throw new Error("Uploaded asset has a different media type");
      result.push(asset);
    } else if (input.type === "EXISTING") {
      const asset = existing.find((asset) => asset.id === input.assetId);
      if (!asset)
        throw new Error("Existing asset does not belong to this draft");
      result.push(asset);
    } else throw new Error("Asset was not prepared");
  }
  if (new Set(result.map((asset) => asset.id)).size !== result.length)
    throw new Error("Each asset may appear only once in a post");
  validateAssetKinds(result);
  return result;
}
async function writeAssets(
  tx: Tx,
  postId: string,
  assets: StoredAsset[],
  existing: StoredAsset[] = [],
) {
  const ids = assets.map((asset) => asset.id);
  await tx
    .delete(postAssets)
    .where(
      ids.length
        ? and(eq(postAssets.postId, postId), notInArray(postAssets.id, ids))
        : eq(postAssets.postId, postId),
    );
  const retained = new Set(existing.map((asset) => asset.id));
  for (const [position, asset] of assets.entries()) {
    if (retained.has(asset.id))
      await tx
        .update(postAssets)
        .set({ position })
        .where(and(eq(postAssets.postId, postId), eq(postAssets.id, asset.id)));
    else await tx.insert(postAssets).values({ ...asset, postId, position });
  }
}
function validId(id: string) {
  return z.uuid().parse(id);
}
export async function listPosts(projectId: string): Promise<Post[]> {
  const rows = await getDb()
    .select()
    .from(posts)
    .where(eq(posts.projectId, validId(projectId)))
    .orderBy(desc(posts.createdAt), desc(posts.id));
  return (await hydrate(rows)).map(toPost);
}
// allowMissingImage lets assistants file Instagram drafts whose image the
// reviewer adds in the dashboard; publishing still requires one.
export async function createPost(
  projectId: string,
  input: unknown,
  { allowMissingImage = false } = {},
): Promise<Post> {
  validId(projectId);
  const parsed = (allowMissingImage ? draftFields : draftSchema).parse(input);
  if (parsed.keepImage)
    throw new Error("A new draft cannot keep an existing image");
  if (parsed.assets?.some((asset) => asset.type === "EXISTING"))
    throw new Error("New posts cannot reference existing assets");
  const prepared = await prepareAssets(projectId, parsed);
  try {
    const post = await getDb().transaction(async (tx) => {
      const assets = await resolveAssets(tx, projectId, prepared.inputs);
      const [row] = await tx
        .insert(posts)
        .values({
          title: parsed.title,
          caption: parsed.caption,
          platforms: parsed.platforms,
          source: parsed.source,
          projectId,
          imageUrl: "",
        })
        .returning();
      await writeAssets(tx, row.id, assets);
      return (await hydrate([row], tx))[0];
    });
    return toPost(post);
  } catch (error) {
    await cleanupAssets(prepared.created);
    throw error;
  }
}
export async function editPost(
  projectId: string,
  id: string,
  input: unknown,
): Promise<Post> {
  validId(id);
  validId(projectId);
  const parsed = draftSchema.parse(input);
  const [existing] = await getDb()
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.projectId, projectId),
        eq(posts.id, id),
        eq(posts.status, "draft"),
      ),
    );
  if (!existing) throw new Error("Draft not found or no longer editable");
  const prepared = await prepareAssets(projectId, parsed);
  let previous: StoredAsset[] = [];
  let updated: MediaPost;
  try {
    updated = await getDb().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(posts)
        .where(and(eq(posts.projectId, projectId), eq(posts.id, id)))
        .for("update");
      if (!current || current.status !== "draft")
        throw new Error("Draft not found or no longer editable");
      previous = storedAssets((await hydrate([current], tx))[0]);
      const assets =
        parsed.assets === undefined &&
        !prepared.inputs.length &&
        parsed.keepImage
          ? previous
          : await resolveAssets(tx, projectId, prepared.inputs, previous);
      if (parsed.platforms.includes("instagram") && !assets.length)
        throw new Error("Instagram requires an image or video");
      const [row] = await tx
        .update(posts)
        .set({
          title: parsed.title,
          caption: parsed.caption,
          platforms: parsed.platforms,
          source: parsed.source,
          imageUrl: "",
          updatedAt: sql`now()`,
        })
        .where(eq(posts.id, id))
        .returning();
      await writeAssets(tx, row.id, assets, previous);
      return (await hydrate([row], tx))[0];
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
  return toPost(updated);
}
export async function deletePost(projectId: string, id: string) {
  validId(id);
  validId(projectId);
  const media = await getDb().transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.projectId, projectId), eq(posts.id, id)))
      .for("update");
    if (!row || row.status === "publishing")
      throw new Error("Post not found or currently publishing");
    const [post] = await hydrate([row], tx);
    await tx.delete(posts).where(eq(posts.id, id));
    return post.assets;
  });
  await cleanupAssets(media);
}
export async function getPostImage(projectId: string, id: string) {
  const [post] = await getDb()
    .select()
    .from(posts)
    .where(
      and(eq(posts.projectId, validId(projectId)), eq(posts.id, validId(id))),
    );
  if (!post) throw new Error("Post not found");
  return (await hydrate([post]))[0];
}
export async function claimPost(
  projectId: string,
  id: string,
  connected: Record<Platform, boolean>,
): Promise<Post> {
  validId(id);
  return getDb().transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.projectId, validId(projectId)), eq(posts.id, id)))
      .for("update");
    if (!post) throw new Error("Post not found");
    if (post.status !== "draft")
      throw new Error(
        "This post has already been submitted. Check its publishing status.",
      );
    for (const platform of post.platforms)
      if (!connected[platform])
        throw new Error(`Connect ${platform} before publishing`);
    const [media] = await hydrate([post], tx);
    if (
      post.platforms.includes("instagram") &&
      !storedAssets(media).length &&
      !post.imageUrl.startsWith("https://")
    )
      throw new Error("Add an image or video before publishing to Instagram");
    const [claimed] = await tx
      .update(posts)
      .set({ status: "publishing", error: null, updatedAt: sql`now()` })
      .where(eq(posts.id, id))
      .returning();
    return toPost({ ...media, ...claimed });
  });
}
export async function saveDelivery(
  id: string,
  platform: Platform,
  remoteId: string,
) {
  const updated = await getDb()
    .update(posts)
    .set({
      results: sql`${posts.results} || ${JSON.stringify({ [platform]: remoteId })}::jsonb`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(posts.id, id), eq(posts.status, "publishing")))
    .returning({ id: posts.id });
  if (!updated.length) throw new Error("Publishing post not found");
}
export async function finishPublication(
  id: string,
  status: "published" | "needs_review",
  error?: string,
): Promise<Post> {
  const [post] = await getDb()
    .update(posts)
    .set({ status, error: error ?? null, updatedAt: sql`now()` })
    .where(and(eq(posts.id, id), eq(posts.status, "publishing")))
    .returning();
  if (!post) throw new Error("Publishing post not found");
  return toPost((await hydrate([post]))[0]);
}
