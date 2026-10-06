import { getAuth } from "./auth";
import { oauthChallenge } from "./oauth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getProject, verifyProjectToken } from "./projects";
import { createPost, listPosts } from "./store";
import {
  mcpDraftSchema,
  fileDraftSchema,
  draftStorageInput,
} from "./mcp-images";
import { appOrigin, createUploadToken } from "./uploads";
export async function handleProjectMcp(req: Request, projectId: string) {
  let project: Awaited<ReturnType<typeof getProject>>;
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
    { name: "post-dispatch", version: "0.3.0" },
    {
      instructions: `You are connected to PostDispatch project "${project.name}" (${project.id}). Every tool operates only on this project. Create drafts for human approval; do not publish. For files attached in ChatGPT use create_draft_from_file, which accepts host-provided download_url and file_id. For other images use create_draft with a typed image object.`,
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
  async function submitDraft(input: z.infer<typeof mcpDraftSchema>) {
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
        { ...draftStorageInput(input), source: input.source || "AI assistant" },
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
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: e instanceof Error ? e.message : "Invalid draft",
          },
        ],
      };
    }
  }
  const draftMetadata = {
    securitySchemes: [{ type: "oauth2", scopes: ["posts:write"] }],
  };
  const draftAnnotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  };
  server.registerTool(
    "create_draft",
    {
      description:
        "Submit a draft for human review. Never publishes automatically. Optional image uses exactly one type: EXTERNAL_URL with url; INLINE_BASE64 with dataBase64 and optional filename/mimeType (256 KB maximum); UPLOAD_ID with uploadId from create_upload_token; OPENAPI_FILE with host-provided download_url, file_id and optional mime_type/file_name. Images must be JPEG, PNG or WebP, up to 4.5 MB. For ChatGPT attachments prefer create_draft_from_file so the host resolves the file. Omit image if unavailable; Instagram drafts then need an image added at reviewUrl before publishing.",
      inputSchema: mcpDraftSchema,
      _meta: draftMetadata,
      annotations: draftAnnotations,
    },
    submitDraft,
  );
  // fileParams cannot annotate a discriminated union: its listed top-level
  // field must resolve to a file object with only download_url/file_id required.
  server.registerTool(
    "create_draft_from_file",
    {
      description:
        "Create a draft using a file attached or generated in ChatGPT. The host supplies image.download_url and image.file_id through openai/fileParams; optional image.mime_type and image.file_name are supported. The server downloads it immediately and stores it privately. JPEG, PNG or WebP, up to 4.5 MB. Never publishes automatically; do not invent file IDs or download URLs.",
      inputSchema: fileDraftSchema,
      _meta: { ...draftMetadata, "openai/fileParams": ["image"] },
      annotations: draftAnnotations,
    },
    (input) =>
      submitDraft({
        ...input,
        image: { ...input.image, type: "OPENAPI_FILE" },
      }),
  );
  server.registerTool(
    "create_upload_token",
    {
      description:
        'Get a bearer token for uploading image files directly over HTTP, without base64 in tool calls. POST each file\'s raw bytes (or multipart with field "file") to uploadUrl with header "Authorization: Bearer <token>", e.g. using curl; each response returns an imageUploadId; pass it to create_draft as image: { type: "UPLOAD_ID", uploadId: imageUploadId }. One token covers up to 20 JPEG, PNG, or WebP files (4.5 MB each; resize larger photos to at most 2048 px on the long edge before uploading) for 60 minutes; reuse it for multiple images. Requires the ability to make HTTP requests (shell, code execution); otherwise use image: { type: "EXTERNAL_URL", url: "https://..." }, create_draft_from_file for ChatGPT files, or omit the image.',
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
