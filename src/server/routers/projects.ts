import { deleteProject } from "@/lib/delete-project";
import {
  createProject,
  disconnectConnector,
  listProjects,
  updateProject,
} from "@/lib/projects";
import { authed, ownsProject } from "../orpc";

// Routes, input and output come from src/contract/projects.ts.
export const projectsRouter = {
  list: authed.projects.list.handler(({ context }) =>
    listProjects(context.userId),
  ),
  create: authed.projects.create.handler(
    async ({ context, input }) =>
      (await createProject(context.userId, input)).project,
  ),
  update: authed.projects.update
    .use(ownsProject)
    .handler(({ context, input: { id, ...values } }) =>
      updateProject(context.userId, id, values),
    ),
  // Ownership is checked inside deleteProject, under the row lock.
  delete: authed.projects.delete.handler(({ context, input }) =>
    deleteProject(context.userId, input.id, input.confirmation),
  ),
  disconnectChannel: authed.projects.disconnectChannel
    .use(ownsProject)
    .handler(async ({ context, input }) => {
      await disconnectConnector(context.userId, input.id, input.provider);
    }),
};
