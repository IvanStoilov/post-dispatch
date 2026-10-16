import "server-only";
import type { ConnectorRow } from "@/db/schema";
import type { ProjectFields } from "@/shared/schemas/project";
import type { Tx } from "../shared/db";
import * as repository from "./repository";

// Business rules shared by user use cases and system operations.

export function isConnected(connector: ConnectorRow) {
  return (
    !!(connector.accountId && connector.accessToken) &&
    (!connector.expiresAt || connector.expiresAt.getTime() > Date.now())
  );
}

// Applies settings to a project the caller has already locked. Facebook and
// Instagram fields update their connection; omitted fields keep their value,
// and clearing both account and token removes the connection.
export async function applyChanges(
  tx: Tx,
  projectId: string,
  changes: ProjectFields,
) {
  await repository.rename(tx, projectId, changes.name);
  for (const provider of ["facebook", "instagram"] as const) {
    const accountId =
      provider === "facebook"
        ? changes.facebookPageId
        : changes.instagramAccountId;
    const accessToken =
      provider === "facebook"
        ? changes.facebookPageToken
        : changes.instagramAccessToken;
    const hostChanged =
      provider === "instagram" && changes.instagramApiHost !== undefined;
    if (accountId === undefined && accessToken === undefined && !hostChanged)
      continue;
    const old = await repository.lockConnector(tx, projectId, provider);
    const next = {
      provider,
      accountId: accountId ?? old?.accountId ?? "",
      accessToken: accessToken ?? old?.accessToken ?? "",
      metadata:
        provider === "instagram"
          ? {
              apiHost:
                changes.instagramApiHost ??
                old?.metadata.apiHost ??
                "graph.facebook.com",
            }
          : {},
    };
    if (!next.accountId && !next.accessToken)
      await repository.deleteConnector(tx, projectId, provider);
    else await repository.upsertConnector(tx, projectId, next);
  }
}
