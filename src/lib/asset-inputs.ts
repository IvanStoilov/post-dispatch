import { z } from "zod";
import { inlineImageFileSchema } from "./storage";
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
const kind = z.enum(["IMAGE", "VIDEO"]).optional();
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
export const editableAssetSchema = z.union([
  assetInputSchema,
  z.object({ type: z.literal("EXISTING"), assetId: z.uuid() }).strict(),
]);
export type AssetInput = z.infer<typeof editableAssetSchema>;
export function validateAssetKinds(assets: { kind: "IMAGE" | "VIDEO" }[]) {
  if (assets.length > 10) throw new Error("A post supports up to 10 images");
  if (assets.some((asset) => asset.kind === "VIDEO") && assets.length !== 1)
    throw new Error(
      "Choose up to 10 images or a single video; videos cannot be mixed with images",
    );
}
