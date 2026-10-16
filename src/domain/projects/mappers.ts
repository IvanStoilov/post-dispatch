import "server-only";
import { connectedAccountUrl } from "@/lib/connectors/account-url";
import type { ProjectDto } from "@/shared/schemas/project";
import type { ConnectorRow } from "@/db/schema";
import type { ProjectRecord } from "./types";

export function toProjectDto(project: ProjectRecord): ProjectDto {
  return {
    id: project.id,
    name: project.name,
    facebookPageId: project.facebookPageId,
    instagramAccountId: project.instagramAccountId,
    instagramApiHost:
      project.instagramApiHost as ProjectDto["instagramApiHost"],
    facebookConfigured: !!(project.facebookPageId && project.facebookPageToken),
    instagramConfigured: !!(
      project.instagramAccountId && project.instagramAccessToken
    ),
    connectors: Object.fromEntries(
      project.connections.map((c) => [
        c.provider,
        {
          accountId: c.accountId,
          accountName: c.accountName,
          accountUrl: connectedAccountUrl(c.provider, c),
          configured: isConnected(c),
          expiresAt: c.expiresAt?.toISOString() || null,
        },
      ]),
    ),
  };
}

// Whether a channel connection can publish: it has an account and a token,
// and the token hasn't expired. Lives here because the DTO's `configured`
// flag needs it; publishing uses it through projectsSystemService.
export function isConnected(connector: ConnectorRow) {
  return (
    !!(connector.accountId && connector.accessToken) &&
    (!connector.expiresAt || connector.expiresAt.getTime() > Date.now())
  );
}
