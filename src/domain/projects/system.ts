import "server-only";
import { getDb } from "@/db";
import { loggedOperation } from "@/lib/logger";
import { UserFacingError } from "../shared/errors";
import * as repository from "./repository";
import type { ConnectorValues } from "./types";

// For workers and other domain modules, never for routers or the UI: these
// work with records that include access tokens and take IDs the caller has
// already authorized.

export { isConnected } from "./rules";
export type { ConnectorValues, ProjectRecord } from "./types";

export function findProjectRecord(projectId: string) {
  return repository.findById(projectId);
}

export function findOwnedProjectRecord(userId: string, projectId: string) {
  return repository.findOwned(userId, projectId);
}

// Stores the connection a connect flow obtained for the user's project.
export async function saveConnector(
  userId: string,
  projectId: string,
  values: ConnectorValues,
) {
  return loggedOperation(
    "domain.projects.saveConnector",
    { userId, projectId },
    () =>
      getDb().transaction(async (tx) => {
        if (!(await repository.lockOwned(tx, userId, projectId)))
          throw new UserFacingError("Project not found", 404);
        await repository.upsertConnector(tx, projectId, {
          ...values,
          refreshToken: values.refreshToken ?? null,
          expiresAt: values.expiresAt ?? null,
          scopes: values.scopes ?? [],
          metadata: values.metadata ?? {},
        });
      }),
  );
}
