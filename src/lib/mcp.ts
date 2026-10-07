import { platforms } from "./types";
import { isConnected } from "./projects";
import { getAuth } from "./auth";
import { oauthChallenge } from "./oauth";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { listProjects } from "./projects";
import { verifyAccountToken, resolveMcpProject } from "./mcp-account";
import { createPost, listPosts } from "./store";
import { mcpDraftSchema, filesDraftSchema } from "./mcp-images";
import {
  createDirectUpload,
  completeDirectUpload,
  directUploadSchema,
} from "./direct-uploads";
import { appOrigin, createUploadToken } from "./uploads";
const projectFields = {
  projectId: z
    .uuid()
    .optional()
    .describe(
      "Destination project ID. Optional only when this account has exactly one project; otherwise required. Discover IDs with list_projects.",
    ),
};
export async function handleAccountMcp(req: Request) {
  let userId = await verifyAccountToken(req.headers.get("authorization"));
  let grantedScopes = ["posts:read", "posts:write"];
  if (!userId) {
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return oauthChallenge();
    try {
      const access = await getAuth().api.verifyMcpOAuthToken({
        body: { token },
      });
      userId = access.userId;
      grantedScopes = access.scopes;
    } catch {
      return oauthChallenge();
    }
  }
  const accountId = userId;
  function toolError(error: unknown) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: error instanceof Error ? error.message : "Tool failed",
        },
      ],
    };
  }
  async function scopedTool<T>(
    scope: string,
    input: { projectId?: string },
    action: (
      project: Awaited<ReturnType<typeof resolveMcpProject>>,
    ) => Promise<T>,
  ) {
    try {
      if (!grantedScopes.includes(scope))
        throw new Error(`Missing ${scope} permission`);
      const project = await resolveMcpProject(accountId, input.projectId);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(await action(project)),
          },
        ],
      };
    } catch (error) {
      return toolError(error);
    }
  }
  const server = new McpServer(
    { name: "post-dispatch", version: "0.5.0" },
    {
      instructions:
        "You are connected to a PostDispatch account. Call list_projects to discover project IDs and available channels. If there is exactly one project, tools select it automatically when projectId is omitted. If there are multiple projects, every project-specific tool requires projectId. Confirm the intended project with the user when unclear; never choose the first project. Each call checks ownership. Create drafts for human approval; do not publish. For ChatGPT files use create_draft_from_files. Use assets arrays for up to 10 images or one video.",
    },
  );
  server.registerTool(
    "list_projects",
    {
      description:
        "List projects owned by this account, with IDs, names, and available channels. Use these IDs for all project-specific tools when more than one project exists.",
      inputSchema: {},
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }] },
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        if (!grantedScopes.includes("posts:read"))
          throw new Error("Missing posts:read permission");
        const projects = await listProjects(accountId);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                projects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  channels: Object.fromEntries(
                    platforms.map((channel) => [
                      channel,
                      !!p.connectors?.[channel]?.configured,
                    ]),
                  ),
                })),
              ),
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
  server.registerTool(
    "get_project",
    {
      description:
        "Get the selected project's name and available channels. projectId required if the account has multiple projects.",
      inputSchema: projectFields,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }] },
      annotations: { readOnlyHint: true },
    },
    (input) =>
      scopedTool("posts:read", input, async (project) => ({
        id: project.id,
        name: project.name,
        channels: Object.fromEntries(
          platforms.map((p) => [
            p,
            project.connections.some((c) => c.provider === p && isConnected(c)),
          ]),
        ),
      })),
  );
  async function submitDraft(
    input: z.infer<typeof mcpDraftSchema> & { projectId?: string },
  ) {
    if (!grantedScopes.includes("posts:write"))
      return {
        isError: true,
        content: [
          { type: "text" as const, text: "Missing posts:write permission" },
        ],
      };
    try {
      const project = await resolveMcpProject(accountId, input.projectId);
      const draft = { ...input };
      delete draft.projectId;
      const post = await createPost(
        project.id,
        { ...draft, source: draft.source || "AI assistant" },
        { allowMissingImage: true },
      );
      const result = {
        ...post,
        reviewUrl: `${appOrigin()}/?projectId=${project.id}`,
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
      inputSchema: mcpDraftSchema.safeExtend(projectFields),
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
      inputSchema: filesDraftSchema.safeExtend(projectFields),
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
  server.registerTool(
    "create_asset_upload",
    {
      description:
        "Prepare a private direct-to-storage upload for an image (4.5 MB maximum) or MP4 video (100 MB maximum). Requires exact fileSize in bytes and mimeType. Returns a short-lived PUT URL and completionToken. PUT file bytes with the provided Content-Type, then call complete_asset_upload. Requires an HTTP-capable client; for ChatGPT attachments prefer create_draft_from_files.",
      inputSchema: directUploadSchema.safeExtend(projectFields),
      _meta: draftMetadata,
      annotations: draftAnnotations,
    },
    (input) =>
      scopedTool("posts:write", input, async (project) => {
        const file = { ...input };
        delete file.projectId;
        return createDirectUpload(project.id, file);
      }),
  );
  server.registerTool(
    "complete_asset_upload",
    {
      description:
        "Verify and finalize a file previously PUT to create_asset_upload's URL. Provide uploadId and completionToken from that tool. Returns assetUploadId; use it as assets:[{type:UPLOAD_ID,uploadId:assetUploadId}] in create_draft. Each finalized upload can belong to only one post.",
      inputSchema: {
        ...projectFields,
        uploadId: z.uuid(),
        completionToken: z.string().min(1).max(100),
      },
      _meta: draftMetadata,
      annotations: draftAnnotations,
    },
    (input) =>
      scopedTool("posts:write", input, (project) =>
        completeDirectUpload(project.id, input.uploadId, input.completionToken),
      ),
  );
  server.registerTool(
    "create_upload_token",
    {
      description:
        'Get a bearer token for uploading image files directly over HTTP, without base64 in tool calls. POST each file\'s raw bytes (or multipart with field "file") to uploadUrl with header "Authorization: Bearer <token>", e.g. using curl; each response returns an imageUploadId; pass it to create_draft as assets: [{ type: "UPLOAD_ID", uploadId: imageUploadId }]. One token covers up to 20 JPEG, PNG, or WebP files (4.5 MB each; resize larger photos to at most 2048 px on the long edge before uploading) for 60 minutes; reuse it for multiple images. Requires the ability to make HTTP requests (shell, code execution); otherwise use assets: [{ type: "EXTERNAL_URL", url: "https://..." }], create_draft_from_files for ChatGPT files, or omit media.',
      inputSchema: projectFields,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:write"] }] },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (input) =>
      scopedTool("posts:write", input, (project) =>
        createUploadToken(project.id),
      ),
  );
  server.registerTool(
    "list_posts",
    {
      description:
        "List saved posts and publishing status for a project. projectId required if the account has multiple projects.",
      inputSchema: projectFields,
      _meta: { securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }] },
      annotations: { readOnlyHint: true },
    },
    (input) =>
      scopedTool("posts:read", input, (project) => listPosts(project.id)),
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
