import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { projectTool, type McpContext } from "../context";
import { filesDraftSchema, mcpDraftSchema, projectFields } from "../schemas";
import { postsService } from "@/domain/posts";
import { appPageUrl } from "@/lib/origins";
import { projectPath } from "@/lib/route-paths";
import { submitDraftInput } from "@/shared/schemas/post";

const writeMeta = {
  securitySchemes: [{ type: "oauth2", scopes: ["posts:write"] }],
};
export const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

export function registerPostTools(server: McpServer, context: McpContext) {
  // Files the draft for review and links the assistant to the review page.
  const submit = (
    tool: string,
    input: { projectId?: string } & Record<string, unknown>,
  ) =>
    projectTool(context, tool, "posts:write", input.projectId, async (p) => {
      const post = await postsService.submitDraft(
        context.actor,
        submitDraftInput.parse({ ...input, projectId: p.id }),
      );
      return {
        ...post,
        reviewUrl: appPageUrl(projectPath(p.id)),
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
    });

  server.registerTool(
    "create_draft",
    {
      description:
        "Submit a draft for human review. Never publishes automatically. Use assets: an ordered array of 1–10 images OR one MP4 video. Each asset has type EXTERNAL_URL (url), UPLOAD_ID (uploadId), OPENAPI_FILE (host-provided download_url, file_id, optional mime_type/file_name), or INLINE_BASE64 (dataBase64, optional filename/mimeType; images only, 256 KB). Optional kind IMAGE or VIDEO is checked against the actual file. JPEG/PNG/WebP images up to 4.5 MB each; MP4 video up to 100 MB. For ChatGPT attachments use create_draft_from_files. For local video uploads call create_asset_upload, PUT bytes to its URL, then complete_asset_upload. Omit media if unavailable; Instagram drafts require media before publishing.",
      inputSchema: mcpDraftSchema.safeExtend(projectFields),
      _meta: writeMeta,
      annotations: writeAnnotations,
    },
    (input) => submit("create_draft", input),
  );
  server.registerTool(
    "create_draft_from_files",
    {
      description:
        "Create a draft with files attached or generated in ChatGPT: up to 10 images OR one MP4 video. The host resolves assets to file objects with download_url and file_id (optional mime_type/file_name) using openai/fileParams. Do not invent download URLs or IDs. Downloads are imported immediately into private storage. Order is preserved. Never publishes automatically.",
      inputSchema: filesDraftSchema.safeExtend(projectFields),
      _meta: { ...writeMeta, "openai/fileParams": ["assets"] },
      annotations: writeAnnotations,
    },
    (input) =>
      submit("create_draft_from_files", {
        ...input,
        assets: input.assets.map((file) => ({
          ...file,
          type: "OPENAPI_FILE" as const,
        })),
      }),
  );
  server.registerTool(
    "list_posts",
    {
      description:
        "List saved posts and publishing status for a project. projectId required if the account has multiple projects.",
      inputSchema: projectFields,
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: ["posts:read"] }],
      },
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) =>
      projectTool(context, "list_posts", "posts:read", projectId, (p) =>
        postsService.list(context.actor, { projectId: p.id }),
      ),
  );
}
