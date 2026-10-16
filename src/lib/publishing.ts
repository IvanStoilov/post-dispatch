import { loggedOperation } from "./logger";
import { getProject, isConnected } from "./projects";
import { platforms } from "./types";
import { assistantsSystemService } from "@/domain/assistants";
export async function connections(projectId: string) {
  return loggedOperation("connections", { projectId }, async () => {
    const project = await getProject(projectId);
    return {
      ...Object.fromEntries(
        platforms.map((p) => [
          p,
          project.connections.some((c) => c.provider === p && isConnected(c)),
        ]),
      ),
      mcp: await assistantsSystemService.hasToken(project.userId),
    };
  });
}
