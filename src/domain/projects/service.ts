import "server-only";
import { getDb } from "@/db";
import { loggedOperation } from "@/lib/logger";
import type {
  CreateProjectInput,
  DisconnectChannelInput,
  ProjectDto,
  ProjectFields,
  UpdateProjectInput,
} from "@/shared/schemas/project";
import type { Actor } from "../shared/actor";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import { isConnected, toProjectDto } from "./mappers";
import * as repository from "./repository";
import type { ConnectorValues } from "./types";

// All business logic for projects. User use cases take an Actor and enforce
// access by scoping every query to it; system operations take IDs the
// caller already authorized. Both are exported as objects at the bottom.

const notFound = () => new UserFacingError("Project not found", 404);

// Applies settings to a project the caller has already locked. Facebook and
// Instagram fields update their connection; omitted fields keep their value,
// and clearing both account and token removes the connection.
async function applyChanges(tx: Tx, projectId: string, changes: ProjectFields) {
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

// User use cases.

async function list(actor: Actor): Promise<ProjectDto[]> {
  return loggedOperation("domain.projects.list", actor, async () =>
    (await repository.listOwned(actor.userId)).map(toProjectDto),
  );
}

async function create(
  actor: Actor,
  input: CreateProjectInput,
): Promise<ProjectDto> {
  return loggedOperation("domain.projects.create", actor, () =>
    getDb().transaction(async (tx) => {
      const project = await repository.insert(tx, {
        userId: actor.userId,
        name: input.name,
      });
      await applyChanges(tx, project.id, { name: input.name });
      return toProjectDto((await repository.findById(project.id, tx))!);
    }),
  );
}

async function update(
  actor: Actor,
  { id, ...changes }: UpdateProjectInput,
): Promise<ProjectDto> {
  return loggedOperation(
    "domain.projects.update",
    { ...actor, projectId: id },
    () =>
      getDb().transaction(async (tx) => {
        if (!(await repository.lockOwned(tx, actor.userId, id)))
          throw notFound();
        await applyChanges(tx, id, changes);
        return toProjectDto((await repository.findById(id, tx))!);
      }),
  );
}

async function disconnectChannel(
  actor: Actor,
  { id, provider }: DisconnectChannelInput,
): Promise<void> {
  return loggedOperation(
    "domain.projects.disconnectChannel",
    { ...actor, projectId: id, provider },
    () =>
      getDb().transaction(async (tx) => {
        if (!(await repository.lockOwned(tx, actor.userId, id)))
          throw notFound();
        await repository.deleteConnector(tx, id, provider);
      }),
  );
}

// System operations: records include access tokens.

// Stores the connection a connect flow obtained for the user's project.
async function saveConnector(
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
          throw notFound();
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

// For routers, pages and MCP tools acting for a signed-in user.
export const projectsService = {
  list,
  create,
  update,
  disconnectChannel,
};

// For workers and other domain modules only: these skip user
// authorization. Lint forbids them in routers and UI.
export const projectsSystemService = {
  findRecord: (projectId: string) => repository.findById(projectId),
  findOwnedRecord: (userId: string, projectId: string) =>
    repository.findOwned(userId, projectId),
  // Prefer lockOwned inside the transaction that writes, so access and the
  // change are atomic.
  isOwned: (userId: string, projectId: string) =>
    repository.isOwned(userId, projectId),
  lockOwned: (tx: Tx, userId: string, projectId: string) =>
    repository.lockOwned(tx, userId, projectId),
  saveConnector,
  isConnected,
};
