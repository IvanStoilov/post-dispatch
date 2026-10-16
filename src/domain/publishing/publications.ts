import "server-only";
import { connectors } from "@/lib/connectors/registry";
import { publicationCapabilities } from "@/lib/connectors/publication-capabilities";
import { safePublicationLink } from "@/lib/connectors/publication-capabilities";
import { logger, redact, withLogSecrets } from "@/lib/logger";
import type { PublicationDto } from "@/shared/schemas/publication";
import { findProjectRecord, isConnected } from "../projects/system";
import { UserFacingError } from "../shared/errors";
import { toPublicationDto } from "./mappers";
import * as repository from "./repository";

// Managing a post's published copies on their networks, for a project the
// caller has already authorized.

export async function listForProject(projectId: string, postId?: string) {
  return (await repository.listPublications(projectId, postId)).map(
    toPublicationDto,
  );
}

type Action =
  { type: "refresh" } | { type: "edit"; caption: string } | { type: "delete" };

const unconfirmed = () =>
  new UserFacingError(
    "The operation could not be confirmed. Check the post on the network before trying again.",
    502,
  );

export async function manage(
  projectId: string,
  id: string,
  action: Action,
): Promise<PublicationDto> {
  const row = await repository.findPublication(projectId, id);
  if (!row) throw new UserFacingError("Published copy not found", 404);
  const publication = toPublicationDto(row);
  if (action.type === "delete" && row.status === "deleted") return publication;
  if (!publicationCapabilities(publication)[action.type])
    throw new UserFacingError(
      "This action is not supported for this published copy.",
      400,
    );
  const project = await findProjectRecord(projectId);
  const connection = project?.connections.find(
    (c) => c.provider === row.platform && c.accountId === row.accountId,
  );
  if (!connection || !isConnected(connection))
    throw new UserFacingError(
      "Reconnect the original publishing account before managing this copy.",
      409,
    );
  const adapter = connectors[row.platform].publications;
  const context = {
    connection,
    publication,
    signal: AbortSignal.timeout(30000),
  };
  const unsupported = (verb: string) =>
    new UserFacingError(`${verb} this network is not supported.`, 400);
  // Network failures: the outcome is unknown, so log the provider's reason
  // (without tokens) and tell the user to check the network.
  const confirm = async <T>(call: Promise<T>) => {
    try {
      return await call;
    } catch (error) {
      logger.warn("publications.request.failed", {
        action: action.type,
        error: redact(
          error instanceof Error ? error.message : "Network request failed",
          [connection.accessToken],
        ),
      });
      throw unconfirmed();
    }
  };
  return withLogSecrets([connection.accessToken], async () => {
    let patch: Parameters<typeof repository.updatePublication>[2];
    if (action.type === "refresh") {
      if (!adapter?.get) throw unsupported("Refreshing");
      const details = await confirm(adapter.get(context));
      patch = {
        permalink:
          safePublicationLink(row.platform, details.permalink) || row.permalink,
        metrics: details.metrics ?? row.metrics,
        refreshedAt: new Date(),
      };
    } else if (action.type === "edit") {
      if (!adapter?.update) throw unsupported("Editing");
      await confirm(adapter.update(context, action.caption));
      patch = { caption: action.caption };
    } else {
      if (!adapter?.delete) throw unsupported("Deleting");
      await confirm(adapter.delete(context));
      patch = { status: "deleted" };
    }
    // Never mark a remote copy deleted or edited until the provider confirms it.
    return toPublicationDto(
      await repository.updatePublication(projectId, id, patch),
    );
  });
}
