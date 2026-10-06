import { getAuth } from "./auth";
import { oauthChallenge } from "./oauth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getProject, verifyProjectToken } from "./projects";
import { createPost, listPosts } from "./store";
import { imageFileSchema } from "./storage";
export async function handleProjectMcp(req: Request, projectId: string) {
  let project;
  try {
    project = await getProject(projectId);
  } catch {
    return Response.json(
      { error: "Invalid project or token" },
      { status: 401 },
    );
  }
  let grantedScopes = ["posts:read", "posts:write"];
  if (!verifyProjectToken(project, req.headers.get("authorization"))) {
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return oauthChallenge(projectId);
    try {
      const access = await getAuth().api.verifyMcpOAuthToken({
        body: { token, projectId },
      });
      grantedScopes = access.scopes;
    } catch {
      return oauthChallenge(projectId);
    }
  }
  const context = {
    id: project.id,
    name: project.name,
    channels: {
      facebook: !!(project.facebookPageId && project.facebookPageToken),
      instagram: !!(project.instagramAccountId && project.instagramAccessToken),
    },
  };
  const server = new McpServer(
    { name: "post-dispatch", version: "0.2.0" },
    {
      instructions: `You are connected to PostDispatch project "${project.name}" (${project.id}). Every tool operates only on this project. Create drafts for human approval; do not publish.`,
    },
  );
  server.registerTool(
    "get_project",
    {
      description:
        "Identify the connected project and its available publishing channels",
      inputSchema: {},
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }] },
      annotations: { readOnlyHint: true },
    },
    async () => ({
      content: [{ type: "text", text: JSON.stringify(context) }],
    }),
  );
  server.registerTool(
    "create_draft",
    {
      description:
        "Submit a draft to PostDispatch for human review. Provide imageUrl (downloaded into private storage) or imageFile with dataBase64 file bytes and optional filename/mimeType. JPEG, PNG, WebP; maximum 8 MB. Never publishes automatically.",
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:write"] }] },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
      inputSchema: {
        title: z.string(),
        caption: z.string(),
        imageUrl: z.string().optional(),
        imageFile: imageFileSchema.optional(),
        platforms: z.array(z.enum(["instagram", "facebook"])),
        source: z.string().optional(),
      },
    },
    async (input) => {
      if (!grantedScopes.includes("posts:write"))
        return {
          isError: true,
          content: [
            { type: "text" as const, text: "Missing posts:write permission" },
          ],
        };
      try {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await createPost(project.id, {
                  ...input,
                  source: input.source || "AI assistant",
                }),
              ),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: e instanceof Error ? e.message : "Invalid draft",
            },
          ],
        };
      }
    },
  );
  server.registerTool(
    "list_posts",
    {
      description: "List saved posts and publishing status",
      inputSchema: {},
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }] },
      annotations: { readOnlyHint: true },
    },
    async () =>
      grantedScopes.includes("posts:read")
        ? {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(await listPosts(project.id)),
              },
            ],
          }
        : {
            isError: true,
            content: [
              { type: "text" as const, text: "Missing posts:read permission" },
            ],
          },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 12 * 1024 * 1024,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
