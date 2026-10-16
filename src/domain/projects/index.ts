import "server-only";

// Public API of the projects module. projectsSystemService skips user
// authorization: only workers and other domain modules may use it.
export { projectsService, projectsSystemService } from "./service";
export type { ConnectorValues, ProjectRecord } from "./types";
