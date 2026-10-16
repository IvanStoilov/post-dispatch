import "server-only";
import { safePublicationLink } from "@/lib/connectors/publication-capabilities";
import type { PublicationDto } from "@/shared/schemas/publication";
import type { PublicationRow } from "./types";

export function toPublicationDto(row: PublicationRow): PublicationDto {
  return {
    id: row.id,
    projectId: row.projectId,
    postId: row.postId,
    platform: row.platform,
    accountId: row.accountId,
    remotePostId: row.remotePostId,
    permalink: safePublicationLink(row.platform, row.permalink),
    caption: row.caption,
    mediaKind: row.mediaKind,
    publishedAt: row.publishedAt.toISOString(),
    status: row.status,
    metrics: row.metrics,
    refreshedAt: row.refreshedAt?.toISOString() ?? null,
  };
}
