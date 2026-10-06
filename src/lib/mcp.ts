import { getAuth } from "./auth";
import { oauthChallenge } from "./oauth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { getProject, verifyProjectToken } from "./projects";
import { createPost, listPosts } from "./store";
import { mcpDraftSchema, filesDraftSchema } from "./mcp-images";
import {
  createDirectUpload,
  completeDirectUpload,
  directUploadSchema,
} from "./direct-uploads";
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
    { name: "post-dispatch", version: "0.4.0" },
    {
      instructions: `You are connected to PostDispatch project "${project.name}" (${project.id}). Every tool operates only on this project. Create drafts for human approval; do not publish. For files attached in ChatGPT use create_draft_from_files, which accepts host-provided download_url and file_id. For other images use create_draft with an assets array of typed sources (up to 10 images or one video).`,
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
        { ...input, source: input.source || "AI assistant" },
        { allowMissingImage: true },
      );
      const result = {
        ...post,
        reviewUrl: `${appOrigin()}/`,
        ...(post.platforms.includes("instagram") &&
        !post.assets.length &&
        !post.imageUrl
          ? {
              needsImage: true,
              needsMedia: true,
              next: "Instagram needs an image or video. Ask the user to add it at reviewUrl before publishing.",
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
        "Submit a draft for human review. Never publishes automatically. Use assets: an ordered array of 1–10 images OR one MP4 video. Each asset has type EXTERNAL_URL (url), UPLOAD_ID (uploadId), OPENAPI_FILE (host-provided download_url, file_id, optional mime_type/file_name), or INLINE_BASE64 (dataBase64, optional filename/mimeType; images only, 256 KB). Optional kind IMAGE or VIDEO is checked against the actual file. JPEG/PNG/WebP images up to 4.5 MB each; MP4 video up to 100 MB. For ChatGPT attachments use create_draft_from_files. For local video uploads call create_asset_upload, PUT bytes to its URL, then complete_asset_upload. Omit media if unavailable; Instagram drafts require media before publishing.",
      inputSchema: mcpDraftSchema,
      _meta: draftMetadata,
      annotations: draftAnnotations,
    },
    submitDraft,
  );
  server.registerTool(
    "create_draft_from_files",
    {
      description:
        "Create a draft with files attached or generated in ChatGPT: up to 10 images OR one MP4 video. The host resolves assets to file objects with download_url and file_id (optional mime_type/file_name) using openai/fileParams. Do not invent download URLs or IDs. Downloads are imported immediately into private storage. Order is preserved. Never publishes automatically.",
      inputSchema: filesDraftSchema,
      _meta: { ...draftMetadata, "openai/fileParams": ["assets"] },
      annotations: draftAnnotations,
    },
    (input) =>
      submitDraft({
        ...input,
        assets: input.assets.map((file) => ({
          ...file,
          type: "OPENAPI_FILE" as const,
        })),
      }),
  );
  async function uploadTool(action: () => Promise<unknown>) {
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
          { type: "text" as const, text: JSON.stringify(await action()) },
        ],
      };
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: error instanceof Error ? error.message : "Upload failed",
          },
        ],
      };
    }
  }
  server.registerTool(
    "create_asset_upload",
    {
      description:
        "Prepare a private direct-to-storage upload for an image (4.5 MB maximum) or MP4 video (100 MB maximum). Requires exact fileSize in bytes and mimeType. Returns a short-lived PUT URL and completionToken. PUT file bytes with the provided Content-Type, then call complete_asset_upload. Requires an HTTP-capable client; for ChatGPT attachments prefer create_draft_from_files.",
      inputSchema: directUploadSchema,
      _meta: draftMetadata,
      annotations: draftAnnotations,
    },
    (input) => uploadTool(() => createDirectUpload(project.id, input)),
  );
  server.registerTool(
    "complete_asset_upload",
    {
      description:
        "Verify and finalize a file previously PUT to create_asset_upload's URL. Provide uploadId and completionToken from that tool. Returns assetUploadId; use it as assets:[{type:UPLOAD_ID,uploadId:assetUploadId}] in create_draft. Each finalized upload can belong to only one post.",
      inputSchema: {
        uploadId: z.uuid(),
        completionToken: z.string().min(1).max(100),
      },
      _meta: draftMetadata,
      annotations: draftAnnotations,
    },
    (input) =>
      uploadTool(() =>
        completeDirectUpload(project.id, input.uploadId, input.completionToken),
      ),
  );
  server.registerTool(
    "create_upload_token",
    {
      description:
        'Get a bearer token for uploading image files directly over HTTP, without base64 in tool calls. POST each file\'s raw bytes (or multipart with field "file") to uploadUrl with header "Authorization: Bearer <token>", e.g. using curl; each response returns an imageUploadId; pass it to create_draft as assets: [{ type: "UPLOAD_ID", uploadId: imageUploadId }]. One token covers up to 20 JPEG, PNG, or WebP files (4.5 MB each; resize larger photos to at most 2048 px on the long edge before uploading) for 60 minutes; reuse it for multiple images. Requires the ability to make HTTP requests (shell, code execution); otherwise use assets: [{ type: "EXTERNAL_URL", url: "https://..." }], create_draft_from_files for ChatGPT files, or omit media.',
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
