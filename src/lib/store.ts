import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { posts, type PostRow } from "../db/schema";
import type { Platform, Post } from "./types";
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
    platforms: z
      .array(z.enum(["instagram", "facebook"]))
      .min(1)
      .max(2)
      .transform((v) => [...new Set(v)]),
    source: z.string().trim().min(1).max(60).default("Manual"),
  })
  .refine((v) => !v.platforms.includes("instagram") || !!v.imageUrl, {
    message: "Instagram requires an image URL",
    path: ["imageUrl"],
  });

function toPost(row: PostRow): Post {
  return {
    ...row,
    createdAt: new Date(row.createdAt).toISOString(),
    error: row.error ?? undefined,
  };
}
function validId(id: string) {
  return z.uuid().parse(id);
}
export async function listPosts(): Promise<Post[]> {
  return (
    await getDb()
      .select()
      .from(posts)
      .orderBy(desc(posts.createdAt), desc(posts.id))
  ).map(toPost);
}
export async function createPost(input: unknown): Promise<Post> {
  const data = draftSchema.parse(input);
  const [post] = await getDb().insert(posts).values(data).returning();
  return toPost(post);
}
export async function editPost(id: string, input: unknown): Promise<Post> {
  validId(id);
  const data = draftSchema.parse(input);
  const [post] = await getDb()
    .update(posts)
    .set({ ...data, updatedAt: sql`now()` })
    .where(and(eq(posts.id, id), eq(posts.status, "draft")))
    .returning();
  if (!post) throw new Error("Draft not found or no longer editable");
  return toPost(post);
}
export async function deletePost(id: string) {
  validId(id);
  const deleted = await getDb()
    .delete(posts)
    .where(and(eq(posts.id, id), eq(posts.status, "draft")))
    .returning({ id: posts.id });
  if (!deleted.length)
    throw new Error("Draft not found or no longer deletable");
}
export async function claimPost(
  id: string,
  connected: Record<Platform, boolean>,
): Promise<Post> {
  validId(id);
  return getDb().transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(posts)
      .where(eq(posts.id, id))
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
