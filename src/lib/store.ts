import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { posts } from "../db/schema";
import {
  postsSystemService as postsSystem,
  type PostRecord,
} from "@/domain/posts";
import { imageFileSchema } from "@/shared/media";
import { editableAssetSchema, type AssetInput } from "@/shared/schemas/asset";
import { loggedOperation } from "./logger";
import { platforms, type Platform, type Post, type StoredAsset } from "./types";

// Deprecated adapter: keeps the old signatures (projectId already
// authorized by the caller, legacy image fields) for code not yet migrated
// to src/domain/posts. New code imports the domain module directly. Remove
// each function when its last caller has migrated.

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
      .array(z.enum(platforms))
      .min(1)
      .max(platforms.length)
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
type LegacyDraft = z.infer<typeof draftFields>;

// The legacy single-image fields are one-asset shorthands.
function legacyAssets(draft: LegacyDraft): AssetInput[] | undefined {
  if (draft.assets !== undefined) return draft.assets;
  if (draft.imageUrl)
    return [{ type: "EXTERNAL_URL", url: draft.imageUrl, kind: "IMAGE" }];
  if (draft.imageFile)
    return [{ type: "INLINE_BASE64", ...draft.imageFile, kind: "IMAGE" }];
  if (draft.imageUploadId)
    return [{ type: "UPLOAD_ID", uploadId: draft.imageUploadId }];
  return undefined;
}
const draftFor = (draft: LegacyDraft, assets: AssetInput[] | undefined) => ({
  title: draft.title,
  caption: draft.caption,
  platforms: draft.platforms,
  source: draft.source,
  assets,
});
const validId = (id: string) => z.uuid().parse(id);

export function storedAssets(row: { assets: StoredAsset[] }): StoredAsset[] {
  return row.assets;
}
const hydrate = postsSystem.hydrate;
const toPost = postsSystem.toPostDto;

export function listPosts(projectId: string): Promise<Post[]> {
  return postsSystem.listForProject(validId(projectId));
}

export async function createPost(
  projectId: string,
  input: unknown,
  { allowMissingImage = false } = {},
): Promise<Post> {
  validId(projectId);
  const parsed = (allowMissingImage ? draftFields : draftSchema).parse(input);
  if (parsed.keepImage)
    throw new Error("A new draft cannot keep an existing image");
  return postsSystem.createForProject(
    projectId,
    draftFor(parsed, legacyAssets(parsed)),
    { allowMissingMedia: allowMissingImage },
  );
}

export async function editPost(
  projectId: string,
  id: string,
  input: unknown,
): Promise<Post> {
  validId(id);
  validId(projectId);
  const parsed = draftSchema.parse(input);
  // No media in the request: keepImage keeps it, otherwise it is removed.
  const assets = legacyAssets(parsed) ?? (parsed.keepImage ? undefined : []);
  return postsSystem.editForProject(projectId, id, draftFor(parsed, assets));
}

export async function deletePost(projectId: string, id: string) {
  return postsSystem.deleteForProject(validId(projectId), validId(id));
}

export async function getPostImage(
  projectId: string,
  id: string,
): Promise<PostRecord> {
  const post = await postsSystem.findRecord(validId(projectId), validId(id));
  if (!post) throw new Error("Post not found");
  return post;
}

// Publishing state; moves to the publishing module when it migrates.

export async function claimPost(
  projectId: string,
  id: string,
  connected: Partial<Record<Platform, boolean>>,
): Promise<Post> {
  return loggedOperation("lib.store.claimPost", { projectId }, async () => {
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
  });
}
export async function saveDelivery(
  id: string,
  platform: Platform,
  remoteId: string,
) {
  return loggedOperation("lib.store.saveDelivery", {}, async () => {
    const updated = await getDb()
      .update(posts)
      .set({
        results: sql`${posts.results} || ${JSON.stringify({ [platform]: remoteId })}::jsonb`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(posts.id, id), eq(posts.status, "publishing")))
      .returning({ id: posts.id });
    if (!updated.length) throw new Error("Publishing post not found");
  });
}
export async function finishPublication(
  id: string,
  status: "published" | "needs_review",
  error?: string,
): Promise<Post> {
  return loggedOperation("lib.store.finishPublication", {}, async () => {
    const [post] = await getDb()
      .update(posts)
      .set({ status, error: error ?? null, updatedAt: sql`now()` })
      .where(and(eq(posts.id, id), eq(posts.status, "publishing")))
      .returning();
    if (!post) throw new Error("Publishing post not found");
    return toPost((await hydrate([post]))[0]);
  });
}
