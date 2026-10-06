import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { posts, type PostRow } from "../db/schema";
import type { Platform, Post } from "./types";
import { imageFileSchema, uploadImage, removeImage } from "./storage";
export const draftSchema = z
  .object({
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
    keepImage: z.boolean().default(false),
    platforms: z
      .array(z.enum(["instagram", "facebook"]))
      .min(1)
      .max(2)
      .transform((v) => [...new Set(v)]),
    source: z.string().trim().min(1).max(60).default("Manual"),
  })
  .refine((v) => !(v.imageUrl && v.imageFile), {
    message: "Provide an image URL or a file, not both",
  })
  .refine(
    (v) =>
      !v.platforms.includes("instagram") ||
      !!v.imageUrl ||
      !!v.imageFile ||
      v.keepImage,
    {
      message: "Instagram requires an image",
      path: ["imageUrl"],
    },
  );

function toPost(row: PostRow): Post {
  const { imageKey, imageBucket, ...safe } = row;
  void imageBucket;
  return {
    ...safe,
    imageUrl: imageKey
      ? `/api/posts/${row.id}/image?projectId=${row.projectId}&v=${encodeURIComponent(row.updatedAt)}`
      : row.imageUrl,
    createdAt: new Date(row.createdAt).toISOString(),
    error: row.error ?? undefined,
  };
}
function validId(id: string) {
  return z.uuid().parse(id);
}
export async function listPosts(projectId: string): Promise<Post[]> {
  return (
    await getDb()
      .select()
      .from(posts)
      .where(eq(posts.projectId, validId(projectId)))
      .orderBy(desc(posts.createdAt), desc(posts.id))
  ).map(toPost);
}
export async function createPost(
  projectId: string,
  input: unknown,
): Promise<Post> {
  validId(projectId);
  const { imageUrl, imageFile, keepImage, ...data } = draftSchema.parse(input);
  if (keepImage) throw new Error("A new draft cannot keep an existing image");
  const image =
    imageUrl || imageFile
      ? await uploadImage(projectId, { imageUrl, imageFile })
      : undefined;
  try {
    const [post] = await getDb()
      .insert(posts)
      .values({ ...data, ...image, projectId, imageUrl: "" })
      .returning();
    return toPost(post);
  } catch (e) {
    if (image) await removeImage(image);
    throw e;
  }
}
export async function editPost(
  projectId: string,
  id: string,
  input: unknown,
): Promise<Post> {
  validId(id);
  validId(projectId);
  const { imageUrl, imageFile, keepImage, ...data } = draftSchema.parse(input);
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
  if (
    keepImage &&
    !existing.imageKey &&
    !existing.imageUrl &&
    !imageUrl &&
    !imageFile &&
    data.platforms.includes("instagram")
  )
    throw new Error("Instagram requires an image");
  const image =
    imageUrl || imageFile
      ? await uploadImage(projectId, { imageUrl, imageFile })
      : undefined;
  let previous: PostRow | undefined;
  let updated: PostRow;
  try {
    updated = await getDb().transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(posts)
        .where(and(eq(posts.projectId, projectId), eq(posts.id, id)))
        .for("update");
      if (!current || current.status !== "draft")
        throw new Error("Draft not found or no longer editable");
      previous = current;
      const media = image
        ? { ...image, imageUrl: "" }
        : keepImage
          ? {}
          : { imageKey: null, imageBucket: null, imageUrl: "" };
      const [row] = await tx
        .update(posts)
        .set({ ...data, ...media, updatedAt: sql`now()` })
        .where(eq(posts.id, id))
        .returning();
      return row;
    });
  } catch (e) {
    if (image) await removeImage(image);
    throw e;
  }
  if (previous && previous.imageKey !== updated.imageKey)
    await cleanupImage(previous);
  return toPost(updated);
}
async function cleanupImage(image: {
  imageKey: string | null;
  imageBucket: string | null;
}) {
  try {
    await removeImage(image);
  } catch {
    console.error("Could not clean up an unused post image");
  }
}
export async function deletePost(projectId: string, id: string) {
  validId(id);
  const [deleted] = await getDb()
    .delete(posts)
    .where(
      and(
        eq(posts.projectId, validId(projectId)),
        eq(posts.id, id),
        eq(posts.status, "draft"),
      ),
    )
    .returning();
  if (!deleted) throw new Error("Draft not found or no longer deletable");
  await cleanupImage(deleted);
}
export async function getPostImage(projectId: string, id: string) {
  const [post] = await getDb()
    .select()
    .from(posts)
    .where(
      and(eq(posts.projectId, validId(projectId)), eq(posts.id, validId(id))),
    );
  if (!post) throw new Error("Post not found");
  return post;
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
    const [claimed] = await tx
      .update(posts)
      .set({ status: "publishing", error: null, updatedAt: sql`now()` })
      .where(eq(posts.id, id))
      .returning();
    return toPost(claimed);
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
  return toPost(post);
}
