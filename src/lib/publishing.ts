import { getProject, isConnected } from "./projects";
import { platforms } from "./types";
import { accountTokenConfigured } from "./mcp-account";
export async function connections(projectId: string) {
  const project = await getProject(projectId);
  return {
    ...Object.fromEntries(
      platforms.map((p) => [
        p,
        project.connections.some((c) => c.provider === p && isConnected(c)),
      ]),
    ),
    mcp: await accountTokenConfigured(project.userId),
  };
}
