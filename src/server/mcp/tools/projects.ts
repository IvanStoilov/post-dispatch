import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { projectTool, runTool, type McpContext } from "../context";
import { projectFields } from "../schemas";
import { projectsService } from "@/domain/projects";
import { platforms } from "@/shared/platforms";
import type { ProjectDto } from "@/shared/schemas/project";

// What assistants see of a project: never connection details or tokens.
const summary = (project: ProjectDto) => ({
  id: project.id,
  name: project.name,
  channels: Object.fromEntries(
    platforms.map((channel) => [
      channel,
      !!project.connectors?.[channel]?.configured,
    ]),
  ),
});

export function registerProjectTools(server: McpServer, context: McpContext) {
  server.registerTool(
    "list_projects",
    {
      description:
        "List projects owned by this account, with IDs, names, and available channels. Use these IDs for all project-specific tools when more than one project exists.",
      inputSchema: {},
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }],
      },
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool(context, "list_projects", "posts:read", async () =>
        (await projectsService.list(context.actor)).map(summary),
      ),
  );
  server.registerTool(
    "get_project",
    {
      description:
        "Get the selected project's name and available channels. projectId required if the account has multiple projects.",
      inputSchema: projectFields,
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }],
      },
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) =>
      projectTool(context, "get_project", "posts:read", projectId, async (p) =>
        summary(p),
      ),
  );
}
