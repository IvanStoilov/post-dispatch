import "server-only";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  postAssets,
  postPublications,
  posts,
  publishJobs,
  type PostRow,
} from "@/db/schema";
import { loggedOperation } from "@/lib/logger";
import type { StoredAsset } from "@/lib/types";
import type { Executor, Tx } from "../shared/db";
import type { PostRecord } from "./types";

// Every query on posts and their media. Rows never leave the domain.

// Loads media, delivery state and publications for the given rows.
export async function hydrate(
  rows: PostRow[],
  db: Executor = getDb(),
): Promise<PostRecord[]> {
  return loggedOperation("domain.posts.hydrate", {}, async () => {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const media = await db
      .select()
      .from(postAssets)
      .where(inArray(postAssets.postId, ids))
      .orderBy(asc(postAssets.position));
    const deliveries = await db
      .select({
        postId: publishJobs.postId,
        platform: publishJobs.platform,
        status: publishJobs.status,
        error: publishJobs.error,
      })
      .from(publishJobs)
      .where(inArray(publishJobs.postId, ids));
    const publications = await db
      .select()
      .from(postPublications)
      .where(inArray(postPublications.postId, ids));
    const grouped = new Map<string, StoredAsset[]>();
    for (const asset of media) {
      const items = grouped.get(asset.postId) || [];
      items.push({
        id: asset.id,
        kind: asset.kind,
        imageKey: asset.imageKey,
        imageBucket: asset.imageBucket,
        storageProvider: asset.storageProvider,
        mimeType: asset.mimeType,
      });
      grouped.set(asset.postId, items);
    }
    return rows.map((row) => {
      const assets = grouped.get(row.id) || [];
      const first = assets[0]?.kind === "IMAGE" ? assets[0] : undefined;
      return {
        ...row,
        publications: publications
          .filter((p) => p.postId === row.id)
          .map((p) => ({
            ...p,
            publishedAt: p.publishedAt.toISOString(),
            refreshedAt: p.refreshedAt?.toISOString() ?? null,
          })),
        deliveries: deliveries
          .filter((j) => j.postId === row.id)
          .map(({ postId, ...delivery }) => {
            void postId;
            return delivery;
          }),
        assets,
        imageKey: first?.imageKey ?? null,
        imageBucket: first?.imageBucket ?? null,
        storageProvider: first?.storageProvider ?? null,
      };
    });
  });
}

export function listByProject(projectId: string, db: Executor = getDb()) {
  return db
    .select()
    .from(posts)
    .where(eq(posts.projectId, projectId))
    .orderBy(desc(posts.createdAt), desc(posts.id));
}

export async function findInProject(
  projectId: string,
  id: string,
  db: Executor = getDb(),
) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.projectId, projectId), eq(posts.id, id)));
  return post as PostRow | undefined;
}

export async function lockInProject(tx: Tx, projectId: string, id: string) {
  const [post] = await tx
    .select()
    .from(posts)
    .where(and(eq(posts.projectId, projectId), eq(posts.id, id)))
    .for("update");
  return post as PostRow | undefined;
}

type DraftValues = Pick<PostRow, "title" | "caption" | "platforms" | "source">;

export async function createPost(
  tx: Tx,
  projectId: string,
  values: DraftValues,
) {
  const [post] = await tx
    .insert(posts)
    .values({ ...values, projectId, imageUrl: "" })
    .returning();
  return post;
}

export async function updateDraft(tx: Tx, id: string, values: DraftValues) {
  const [post] = await tx
    .update(posts)
    .set({ ...values, imageUrl: "", updatedAt: sql`now()` })
    .where(eq(posts.id, id))
    .returning();
  return post;
}

export async function lockById(tx: Tx, id: string) {
  const [post] = await tx
    .select()
    .from(posts)
    .where(eq(posts.id, id))
    .for("update");
  return post as PostRow | undefined;
}

// Publishing state (status, results, error) is written by the publishing
// module through postsSystemService; content stays with the posts use cases.
export async function setPublishingState(
  tx: Tx,
  id: string,
  values: Partial<Pick<PostRow, "status" | "error" | "results">>,
) {
  const [post] = await tx
    .update(posts)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(posts.id, id))
    .returning();
  return post;
}

// Posts left publishing by the old synchronous flow, from before publish
// jobs existed, need a person to check the networks.
export async function markOrphanedPublishing(projectId?: string) {
  await getDb()
    .update(posts)
    .set({
      status: "needs_review",
      error:
        "An older publishing request was interrupted. Check the selected accounts before resubmitting.",
      updatedAt: sql`now()`,
    })
    .where(
      and(
        projectId ? eq(posts.projectId, projectId) : undefined,
        eq(posts.status, "publishing"),
        sql`${posts.updatedAt} < now() - interval '10 minutes'`,
        sql`NOT EXISTS (SELECT 1 FROM publish_jobs WHERE publish_jobs.post_id = ${posts.id})`,
      ),
    );
}

export async function remove(tx: Tx, id: string) {
  await tx.delete(posts).where(eq(posts.id, id));
}

// Makes the post's media exactly `assets`, in order: drops others, keeps
// `existing` ones in place (repositioned) and inserts new ones.
export async function writeAssets(
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
    if (retained.has(asset.id)) {
      await tx
        .update(postAssets)
        .set({ position })
        .where(and(eq(postAssets.postId, postId), eq(postAssets.id, asset.id)));
    } else {
      await tx.insert(postAssets).values({ ...asset, postId, position });
    }
  }
}
