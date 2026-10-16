import { z } from "zod";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../media";
import { assetKinds } from "./asset";

// Inputs and DTOs for media uploads. Browser-safe. A finished upload is
// attached to a draft with assets: [{ type: "UPLOAD_ID", uploadId }].

const projectId = z.uuid();
const uploadId = z.uuid();

// The file a direct-to-storage upload will receive.
export const uploadFileFields = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
    fileSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  })
  .strict()
  .refine(
    (v) => v.mimeType === "video/mp4" || v.fileSize <= MAX_IMAGE_BYTES,
    "Images must be 4.5 MB or smaller",
  );

export const startUploadInput = uploadFileFields.safeExtend({ projectId });
export type StartUploadInput = z.output<typeof startUploadInput>;

export const completeUploadInput = z.object({ projectId, uploadId });
export type CompleteUploadInput = z.output<typeof completeUploadInput>;

// Completing without a session (assistants over HTTP) proves the upload
// with the token it was started with.
export const completeUploadWithTokenInput = completeUploadInput.extend({
  completionToken: z.string().min(1).max(100),
});
export type CompleteUploadWithTokenInput = z.output<
  typeof completeUploadWithTokenInput
>;

export const createUploadTokenInput = z.object({ projectId });
export type CreateUploadTokenInput = z.output<typeof createUploadTokenInput>;

// Where to PUT the file, and how to finish the upload.
export const uploadTargetDto = z.object({
  uploadId,
  uploadUrl: z.url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  uploadExpiresAt: z.iso.datetime(),
  completionToken: z.string(),
  completionUrl: z.url(),
  next: z.string(),
});
export type UploadTargetDto = z.output<typeof uploadTargetDto>;

// A stored file, ready to attach to one draft before it expires.
export const assetUploadDto = z.object({
  assetUploadId: uploadId,
  // Older name for assetUploadId, kept for assistants that use it.
  imageUploadId: uploadId,
  kind: z.enum(assetKinds),
  expiresAt: z.iso.datetime(),
  next: z.string().optional(),
});
export type AssetUploadDto = z.output<typeof assetUploadDto>;

export const uploadTokenDto = z.object({
  uploadUrl: z.url(),
  token: z.string(),
  expiresAt: z.iso.datetime(),
  maxUploads: z.number().int(),
  maxBytes: z.number().int(),
  acceptedTypes: z.array(z.string()),
  example: z.string(),
  next: z.string(),
});
export type UploadTokenDto = z.output<typeof uploadTokenDto>;
