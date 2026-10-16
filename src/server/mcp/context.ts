import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { assistantsService } from "@/domain/assistants";
import { projectsService } from "@/domain/projects";
import type { Actor } from "@/domain/shared/actor";
import { UserFacingError } from "@/domain/shared/errors";
import { getAuth } from "@/lib/auth";
import { loggedOperation, logger, withLogContext } from "@/lib/logger";
import type { ProjectDto } from "@/shared/schemas/project";

export type Scope = "posts:read" | "posts:write";
export type McpContext = { actor: Actor; scopes: string[] };

// The caller: an account MCP token (every scope) or an OAuth access token
// (the scopes the user granted). Null when neither is valid.
export async function authenticate(req: Request): Promise<McpContext | null> {
  const authorization = req.headers.get("authorization");
  const userId = await assistantsService.verifyToken(authorization);
  if (userId) {
    return { actor: { userId }, scopes: ["posts:read", "posts:write"] };
  }
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    return null;
  }
  try {
    const access = await getAuth().api.verifyMcpOAuthToken({
      body: { token },
    });
    return { actor: { userId: access.userId }, scopes: access.scopes };
  } catch {
    return null;
  }
}

// Resolved on every call: never remember a previous project's selection.
// With one project, tools may omit projectId; with more, it is required.
export async function resolveProject(
  actor: Actor,
  projectId?: string,
): Promise<ProjectDto> {
  const projects = await projectsService.list(actor);
  if (projectId) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      throw new UserFacingError("Project not found", 404);
    }
    return project;
  }
  if (!projects.length) {
    throw new UserFacingError(
      "No projects found. Create a project in Ramblo first.",
      404,
    );
  }
  if (projects.length !== 1) {
    throw new UserFacingError(
      "projectId is required when your account has multiple projects. Call list_projects and pass the intended project's ID.",
      400,
    );
  }
  return projects[0];
}

const text = (value: string, isError = false): CallToolResult => ({
  ...(isError ? { isError } : {}),
  content: [{ type: "text", text: value }],
});

// Runs a tool and returns its value as JSON. The one place tool errors are
// translated: UserFacingErrors reach the assistant with their message;
// anything else is logged and reported generically.
export function runTool<T>(
  { actor, scopes }: McpContext,
  tool: string,
  scope: Scope,
  action: () => Promise<T>,
) {
  return loggedOperation("mcp.tool", { tool, ...actor }, async () => {
    try {
      if (!scopes.includes(scope)) {
        throw new UserFacingError(`Missing ${scope} permission`, 403);
      }
      return text(JSON.stringify(await action()));
    } catch (error) {
      if (!(error instanceof UserFacingError)) {
        logger.error("mcp.tool.failed", { tool, error });
        return text("The tool failed. Try again later.", true);
      }
      logger.warn("mcp.tool.rejected", {
        tool,
        status: error.status,
        reason: error.message,
      });
      return text(error.message, true);
    }
  });
}

// A tool acting on one of the caller's projects (see resolveProject).
export function projectTool<T>(
  context: McpContext,
  tool: string,
  scope: Scope,
  projectId: string | undefined,
  action: (project: ProjectDto) => Promise<T>,
) {
  return runTool(context, tool, scope, async () => {
    const project = await resolveProject(context.actor, projectId);
    return withLogContext({ projectId: project.id }, () => action(project));
  });
}
