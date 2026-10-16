// Connector integration test helper: publishes a post synchronously, one
// network after another, so tests can drive connector adapters directly.
// The application publishes through jobs (src/domain/publishing).
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../src/db";
import { posts } from "../../src/db/schema";
import { postsSystemService } from "../../src/domain/posts";
import { projectsSystemService } from "../../src/domain/projects";
import { connectors } from "../../src/lib/connectors/registry";
import { withLogContext } from "../../src/lib/logger";
import { getAssetUrl } from "../../src/lib/storage";
import type { Platform } from "../../src/lib/types";
import { postRecord, projectRecord } from "./fixtures";

// Moves a draft to publishing if every network is connected.
export async function claimPost(
  projectId: string,
  id: string,
  connected: Partial<Record<Platform, boolean>>,
) {
  return getDb().transaction(async (tx) => {
    const [post] = await tx
      .select()
      .from(posts)
      .where(and(eq(posts.projectId, projectId), eq(posts.id, id)))
      .for("update");
    if (!post) throw new Error("Post not found");
    if (post.status !== "draft")
      throw new Error(
        "This post has already been submitted. Check its publishing status.",
      );
    for (const platform of post.platforms)
      if (!connected[platform])
        throw new Error(`Connect ${platform} before publishing`);
    const [media] = await postsSystemService.hydrate([post], tx);
    if (
      post.platforms.includes("instagram") &&
      !media.assets.length &&
      !post.imageUrl.startsWith("https://")
    )
      throw new Error("Add an image or video before publishing to Instagram");
    const [claimed] = await tx
      .update(posts)
      .set({ status: "publishing", error: null, updatedAt: sql`now()` })
      .where(eq(posts.id, id))
      .returning();
    return postsSystemService.toPostDto({ ...media, ...claimed });
  });
}

async function saveDelivery(id: string, platform: Platform, remoteId: string) {
  await getDb()
    .update(posts)
    .set({
      results: sql`${posts.results} || ${JSON.stringify({ [platform]: remoteId })}::jsonb`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(posts.id, id), eq(posts.status, "publishing")));
}

async function finish(
  projectId: string,
  id: string,
  status: "published" | "needs_review",
  error?: string,
) {
  await getDb()
    .update(posts)
    .set({ status, error: error ?? null, updatedAt: sql`now()` })
    .where(and(eq(posts.id, id), eq(posts.status, "publishing")));
  return postsSystemService.toPostDto(await postRecord(projectId, id));
}

export async function publishPost(projectId: string, id: string) {
  return withLogContext({ projectId, postId: id }, async () => {
    const project = await projectRecord(projectId);
    const connected = Object.fromEntries(
      project.connections.map((c) => [
        c.provider,
        projectsSystemService.isConnected(c),
      ]),
    );
    const post = await claimPost(projectId, id, connected);
    const signal = AbortSignal.timeout(240000);
    try {
      const media = await postRecord(projectId, id);
      const assets = media.assets;
      const urls: string[] = [];
      for (const asset of assets) urls.push(await getAssetUrl(asset));
      if (!urls.length && media.imageUrl) urls.push(media.imageUrl);
      // Validate every destination before making any irreversible provider call.
      for (const target of post.platforms) {
        const capability = connectors[target].capabilities;
        if (!capability.text && !urls.length)
          throw new Error(`${target} requires media`);
        if (urls.length > capability.images)
          throw new Error(`Too many images for ${target}`);
        if (
          assets.some((a) => a.kind === "VIDEO") &&
          (!capability.video || assets.length !== 1)
        )
          throw new Error(`Unsupported video combination for ${target}`);
      }
      for (const target of post.platforms) {
        const connection = project.connections.find(
          (c) => c.provider === target,
        )!;
        const remoteId = await connectors[target].publish({
          connection,
          post,
          assets,
          urls,
          signal,
        });
        await saveDelivery(id, target, remoteId);
      }
      return finish(projectId, id, "published");
    } catch (error) {
      await finish(
        projectId,
        id,
        "needs_review",
        `Publishing stopped. Check the selected networks before resubmitting to avoid duplicates. ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  });
}
