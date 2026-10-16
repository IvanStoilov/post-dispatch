import "server-only";

// Public API of the projects module: user use cases that take an Actor and
// return DTOs. Workers and other modules use ./system instead.
export {
  createProject,
  disconnectChannel,
  listProjects,
  updateProject,
} from "./service";
