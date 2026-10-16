import { projectsService } from "@/domain/projects";
import { deleteProject } from "@/lib/delete-project";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/projects.ts; access is
// enforced by the domain, scoped to context.actor.
export const projectsRouter = {
  list: authed.projects.list.handler(({ context }) =>
    projectsService.list(context.actor),
  ),
  create: authed.projects.create.handler(({ context, input }) =>
    projectsService.create(context.actor, input),
  ),
  update: authed.projects.update.handler(({ context, input }) =>
    projectsService.update(context.actor, input),
  ),
  // Moves to the domain with the accounts module (deletion is shared there).
  delete: authed.projects.delete.handler(({ context, input }) =>
    deleteProject(context.actor.userId, input.id, input.confirmation),
  ),
  disconnectChannel: authed.projects.disconnectChannel.handler(
    ({ context, input }) =>
      projectsService.disconnectChannel(context.actor, input),
  ),
};
