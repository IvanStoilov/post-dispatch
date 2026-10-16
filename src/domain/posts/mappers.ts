import "server-only";
import type { PostRecord } from "./types";
import type { PostDto } from "@/shared/schemas/post";

// Media is served by owner-only routes; `v` busts caches after edits.
export function toPostDto(post: PostRecord): PostDto {
  const version = encodeURIComponent(post.updatedAt);
  const assets = post.assets.map((asset) => ({
    id: asset.id,
    kind: asset.kind,
    mimeType: asset.mimeType,
    url: `/api/posts/${post.id}/assets/${asset.id}?projectId=${post.projectId}&v=${version}`,
  }));
  return {
    id: post.id,
    projectId: post.projectId,
    title: post.title,
    caption: post.caption,
    imageUrl:
      assets[0]?.kind === "IMAGE"
        ? `/api/posts/${post.id}/image?projectId=${post.projectId}&v=${version}`
        : post.imageUrl,
    assets,
    platforms: post.platforms,
    source: post.source,
    status: post.status,
    createdAt: new Date(post.createdAt).toISOString(),
    results: post.results,
    publications: post.publications,
    error: post.error ?? undefined,
    deliveries: post.deliveries,
  };
}
