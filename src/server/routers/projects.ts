import {
  createProject,
  disconnectChannel,
  listProjects,
  updateProject,
} from "@/domain/projects";
import { deleteProject } from "@/lib/delete-project";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/projects.ts; access is
// enforced by the domain, scoped to context.actor.
export const projectsRouter = {
  list: authed.projects.list.handler(({ context }) =>
    listProjects(context.actor),
  ),
  create: authed.projects.create.handler(({ context, input }) =>
    createProject(context.actor, input),
  ),
  update: authed.projects.update.handler(({ context, input }) =>
    updateProject(context.actor, input),
  ),
  // Moves to the domain with the accounts module (deletion is shared there).
  delete: authed.projects.delete.handler(({ context, input }) =>
    deleteProject(context.actor.userId, input.id, input.confirmation),
  ),
  disconnectChannel: authed.projects.disconnectChannel.handler(
    ({ context, input }) => disconnectChannel(context.actor, input),
  ),
};
