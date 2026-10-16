import type { ConnectorRow, ProjectRow, projectConnectors } from "@/db/schema";

// A project with its channel connections, as loaded from the database.
// Holds access tokens: it must never leave the domain. Map it with
// toProjectDto before returning it from a use case.
export type ProjectRecord = ProjectRow & {
  connections: ConnectorRow[];
  facebookPageId: string;
  facebookPageToken: string;
  instagramAccountId: string;
  instagramAccessToken: string;
  instagramApiHost: string;
};

// A channel connection as written by the connect flows.
export type ConnectorValues = Omit<
  typeof projectConnectors.$inferInsert,
  "id" | "projectId"
>;
