import { z } from "zod";
import { inlineImageFileSchema } from "../media";

// How clients reference media in a post. Browser-safe.

export const httpsUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Use an HTTPS download URL",
  );
export const openaiFileSchema = z
  .object({
    download_url: httpsUrl,
    file_id: z.string().min(1).max(255),
    mime_type: z.string().max(100).optional(),
    file_name: z.string().max(255).optional(),
  })
  .strict();
export const assetKinds = ["IMAGE", "VIDEO"] as const;
const kind = z.enum(assetKinds).optional();
export const assetInputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EXTERNAL_URL"), url: httpsUrl, kind }).strict(),
  inlineImageFileSchema
    .extend({
      type: z.literal("INLINE_BASE64"),
      kind: z.literal("IMAGE").optional(),
    })
    .strict(),
  z.object({ type: z.literal("UPLOAD_ID"), uploadId: z.uuid(), kind }).strict(),
  openaiFileSchema.extend({ type: z.literal("OPENAPI_FILE"), kind }).strict(),
]);
// When editing, EXISTING keeps one of the post's current assets in place.
export const editableAssetSchema = z.union([
  assetInputSchema,
  z.object({ type: z.literal("EXISTING"), assetId: z.uuid() }).strict(),
]);
export type AssetInput = z.output<typeof editableAssetSchema>;
