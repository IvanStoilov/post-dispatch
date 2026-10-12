import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { postPublications, type PublicationRow } from "../db/schema";
import { getProject, isConnected } from "./projects";
import { connectors } from "./connectors/registry";
import {
  publicationCapabilities,
  safePublicationLink,
} from "./connectors/publication-capabilities";
import { loggedOperation, withLogSecrets, redact } from "./logger";
import type { Publication } from "./types";

export class PublicationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function toPublication(row: PublicationRow): Publication {
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
export async function listPublications(projectId: string, postId?: string) {
  z.uuid().parse(projectId);
  if (postId) z.uuid().parse(postId);
  return loggedOperation("publications.list", { projectId }, async () => {
    const rows = await getDb()
      .select()
      .from(postPublications)
      .where(
        and(
          eq(postPublications.projectId, projectId),
          postId ? eq(postPublications.postId, postId) : undefined,
        ),
      )
      .orderBy(desc(postPublications.publishedAt));
    return rows.map(toPublication);
  });
}
export async function managePublication(
  projectId: string,
  id: string,
  action: "refresh" | "edit" | "delete",
  caption?: string,
) {
  z.uuid().parse(id);
  return loggedOperation(
    "publications.manage",
    { projectId, publicationId: id, action },
    async () => {
      const [row] = await getDb()
        .select()
        .from(postPublications)
        .where(
          and(
            eq(postPublications.id, id),
            eq(postPublications.projectId, projectId),
          ),
        );
      if (!row) throw new PublicationError("Published copy not found", 404);
      const publication = toPublication(row);
      if (action === "delete" && row.status === "deleted") return publication;
      if (!publicationCapabilities(publication)[action])
        throw new PublicationError(
          "This action is not supported for this published copy.",
        );
      const project = await getProject(projectId);
      const connection = project.connections.find(
        (c) => c.provider === row.platform && c.accountId === row.accountId,
      );
      if (!connection || !isConnected(connection))
        throw new PublicationError(
          "Reconnect the original publishing account before managing this copy.",
          409,
        );
      const adapter = connectors[row.platform].publications;
      const context = {
        connection,
        publication,
        signal: AbortSignal.timeout(30000),
      };
      return withLogSecrets([connection.accessToken], async () => {
        let patch: Partial<typeof postPublications.$inferInsert>;
        if (action === "refresh") {
          if (!adapter?.get)
            throw new PublicationError(
              "Refreshing this network is not supported.",
            );
          const details = await adapter.get(context).catch((error) => {
            throw new Error(
              String(
                redact(
                  error instanceof Error
                    ? error.message
                    : "Network request failed",
                  [connection.accessToken],
                ),
              ),
            );
          });
          patch = {
            permalink:
              safePublicationLink(row.platform, details.permalink) ||
              row.permalink,
            metrics: details.metrics ?? row.metrics,
            refreshedAt: new Date(),
          };
        } else if (action === "edit") {
          const text = z.string().trim().min(1).max(2200).parse(caption);
          if (!adapter?.update)
            throw new PublicationError(
              "Editing this network is not supported.",
            );
          await adapter.update(context, text).catch((error) => {
            throw new Error(
              String(
                redact(
                  error instanceof Error
                    ? error.message
                    : "Network request failed",
                  [connection.accessToken],
                ),
              ),
            );
          });
          patch = { caption: text };
        } else {
          if (!adapter?.delete)
            throw new PublicationError(
              "Deleting this network is not supported.",
            );
          await adapter.delete(context).catch((error) => {
            throw new Error(
              String(
                redact(
                  error instanceof Error
                    ? error.message
                    : "Network request failed",
                  [connection.accessToken],
                ),
              ),
            );
          });
          patch = { status: "deleted" };
        }
        // Never mark a remote copy deleted or edited until the provider confirms it.
        const [updated] = await getDb()
          .update(postPublications)
          .set({ ...patch, updatedAt: new Date() })
          .where(
            and(
              eq(postPublications.id, id),
              eq(postPublications.projectId, projectId),
            ),
          )
          .returning();
        return toPublication(updated);
      });
    },
  );
}
