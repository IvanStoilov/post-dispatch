import { getAuth } from "./auth";
import { oauthChallenge } from "./oauth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getProject, verifyProjectToken } from "./projects";
import { createPost, listPosts } from "./store";
import { inlineImageFileSchema } from "./storage";
import { appOrigin, createUploadToken } from "./uploads";
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
        "Submit a draft to PostDispatch for human review. Never publishes automatically. Attach at most one image (JPEG, PNG, or WebP, up to 4.5 MB; resize larger photos to at most 2048 px on the long edge first): imageUploadId (from uploading the file with create_upload_token) when you can make HTTP requests (preferred for local or generated files); imageUrl when the image is already reachable over public HTTPS (including temporary download links); or imageFile.dataBase64 only for images under 256 KB. Do not base64-encode larger images. If you cannot provide the image, omit it: the draft is still created and the result includes a reviewUrl where a person can add it before publishing.",
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
        imageUploadId: z.string().optional(),
        imageUrl: z.string().optional(),
        imageFile: inlineImageFileSchema.optional(),
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
        const post = await createPost(
          project.id,
          { ...input, source: input.source || "AI assistant" },
          { allowMissingImage: true },
        );
        const result = {
          ...post,
          reviewUrl: `${appOrigin()}/`,
          ...(post.platforms.includes("instagram") && !post.imageUrl
            ? {
                needsImage: true,
                next: "Instagram needs an image. Ask the user to add it at reviewUrl before publishing.",
              }
            : {}),
        };
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
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
    "create_upload_token",
    {
      description:
        'Get a bearer token for uploading image files directly over HTTP, without base64 in tool calls. POST each file\'s raw bytes (or multipart with field "file") to uploadUrl with header "Authorization: Bearer <token>", e.g. using curl; each response returns an imageUploadId for create_draft. One token covers up to 20 JPEG, PNG, or WebP files (4.5 MB each; resize larger photos to at most 2048 px on the long edge before uploading) for 60 minutes; reuse it for multiple images. Requires the ability to make HTTP requests (shell, code execution); otherwise use imageUrl or omit the image.',
      inputSchema: {},
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:write"] }] },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async () => {
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
              type: "text" as const,
              text: JSON.stringify(await createUploadToken(project.id)),
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: e instanceof Error ? e.message : "Could not create upload",
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
    maxRequestBodySize: 1024 * 1024,
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
