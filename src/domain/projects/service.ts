import "server-only";
import { getDb } from "@/db";
import { loggedOperation } from "@/lib/logger";
import type {
  CreateProjectInput,
  DisconnectChannelInput,
  ProjectDto,
  UpdateProjectInput,
} from "@/shared/schemas/project";
import type { Actor } from "../shared/actor";
import { UserFacingError } from "../shared/errors";
import { toProjectDto } from "./mappers";
import * as repository from "./repository";
import { applyChanges } from "./rules";

// User use cases. Input is already validated by the transport; access is
// enforced here by scoping every query to the actor.

const notFound = () => new UserFacingError("Project not found", 404);

export async function listProjects(actor: Actor): Promise<ProjectDto[]> {
  return loggedOperation("domain.projects.list", actor, async () =>
    (await repository.listOwned(actor.userId)).map(toProjectDto),
  );
}

export async function createProject(
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

export async function updateProject(
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

export async function disconnectChannel(
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
