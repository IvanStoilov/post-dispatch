import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { projectTool, type McpContext } from "../context";
import { projectFields } from "../schemas";
import { writeAnnotations } from "./posts";
import { uploadFileFields } from "@/shared/schemas/upload";
import { uploadsService } from "@/domain/uploads";

const writeMeta = {
  securitySchemes: [{ type: "oauth2", scopes: ["posts:write"] }],
};

export function registerUploadTools(server: McpServer, context: McpContext) {
  server.registerTool(
    "create_asset_upload",
    {
      description:
        "Prepare a private direct-to-storage upload for an image (4.5 MB maximum) or MP4 video (100 MB maximum). Requires exact fileSize in bytes and mimeType. Returns a short-lived PUT URL and completionToken. PUT file bytes with the provided Content-Type, then call complete_asset_upload. Requires an HTTP-capable client; for ChatGPT attachments prefer create_draft_from_files.",
      inputSchema: uploadFileFields.safeExtend(projectFields),
      _meta: writeMeta,
      annotations: writeAnnotations,
    },
    ({ projectId, mimeType, fileSize }) =>
      projectTool(
        context,
        "create_asset_upload",
        "posts:write",
        projectId,
        (p) =>
          uploadsService.start(context.actor, {
            projectId: p.id,
            mimeType,
            fileSize,
          }),
      ),
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
      _meta: writeMeta,
      annotations: writeAnnotations,
    },
    ({ projectId, uploadId, completionToken }) =>
      projectTool(
        context,
        "complete_asset_upload",
        "posts:write",
        projectId,
        (p) =>
          uploadsService.complete(context.actor, {
            projectId: p.id,
            uploadId,
            completionToken,
          }),
      ),
  );
  server.registerTool(
    "create_upload_token",
    {
      description:
        'Get a bearer token for uploading image files directly over HTTP, without base64 in tool calls. POST each file\'s raw bytes (or multipart with field "file") to uploadUrl with header "Authorization: Bearer <token>", e.g. using curl; each response returns an imageUploadId; pass it to create_draft as assets: [{ type: "UPLOAD_ID", uploadId: imageUploadId }]. One token covers up to 20 JPEG, PNG, or WebP files (4.5 MB each; resize larger photos to at most 2048 px on the long edge before uploading) for 60 minutes; reuse it for multiple images. Requires the ability to make HTTP requests (shell, code execution); otherwise use assets: [{ type: "EXTERNAL_URL", url: "https://..." }], create_draft_from_files for ChatGPT files, or omit media.',
      inputSchema: projectFields,
      _meta: writeMeta,
      annotations: writeAnnotations,
    },
    ({ projectId }) =>
      projectTool(
        context,
        "create_upload_token",
        "posts:write",
        projectId,
        (p) => uploadsService.createToken(context.actor, { projectId: p.id }),
      ),
  );
}
