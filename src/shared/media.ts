import { z } from "zod";

// Media limits and inline-file schemas, shared by the API contract, MCP
// tools and storage. Browser-safe: no server imports.

export const MAX_VIDEO_BYTES = 100_000_000;
// Vercel rejects function request bodies over 4.5 MB before our code runs.
export const MAX_IMAGE_BYTES = 4_500_000;
export const MAX_IMAGE_LABEL = "4.5 MB";
export const IMAGE_TOO_LARGE = `Images must be ${MAX_IMAGE_LABEL} or smaller. Resize to at most 2048 px on the long edge (images are stored at up to 1440×1800) and try again.`;

export const imageFileSchema = z.object({
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_IMAGE_BYTES / 3) * 4),
  filename: z.string().max(255).optional(),
  mimeType: z.string().max(100).optional(),
});
// Inline base64 makes the model emit every byte as output tokens, so MCP only
// accepts it for small images; larger ones go through create_upload_token.
export const MAX_INLINE_IMAGE_BYTES = 256 * 1024;
export const inlineImageFileSchema = imageFileSchema.extend({
  dataBase64: z
    .string()
    .min(1)
    .max(Math.ceil(MAX_INLINE_IMAGE_BYTES / 3) * 4),
});
