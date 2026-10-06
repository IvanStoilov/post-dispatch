import { z } from "zod";
import { inlineImageFileSchema } from "./storage";
import { assetInputSchema, openaiFileSchema, httpsUrl } from "./asset-inputs";
export { openaiFileSchema } from "./asset-inputs";
const downloadUrl = httpsUrl;
export const mcpImageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("EXTERNAL_URL"), url: downloadUrl }).strict(),
  inlineImageFileSchema.extend({ type: z.literal("INLINE_BASE64") }).strict(),
  z.object({ type: z.literal("UPLOAD_ID"), uploadId: z.uuid() }).strict(),
  openaiFileSchema.extend({ type: z.literal("OPENAPI_FILE") }).strict(),
]);
const draftFields = {
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(2200),
  platforms: z
    .array(z.enum(["instagram", "facebook"]))
    .min(1)
    .max(2),
  source: z.string().trim().min(1).max(60).optional(),
};
export const mcpDraftSchema = z
  .object({
    ...draftFields,
    image: mcpImageSchema.optional(),
    assets: z.array(assetInputSchema).min(1).max(10).optional(),
  })
  .strict()
  .refine((v) => !(v.image && v.assets), "Provide image or assets, not both")
  .refine(
    (v) => !v.assets?.some((a) => a.kind === "VIDEO") || v.assets.length === 1,
    "Provide multiple images or one video",
  );
export const fileDraftSchema = z
  .object({ ...draftFields, image: openaiFileSchema })
  .strict();
export const filesDraftSchema = z
  .object({ ...draftFields, assets: z.array(openaiFileSchema).min(1).max(10) })
  .strict();
export function draftStorageInput(input: z.infer<typeof mcpDraftSchema>) {
  const { image, ...draft } = input;
  if (!image) return draft;
  switch (image.type) {
    case "EXTERNAL_URL":
      return { ...draft, imageUrl: image.url };
    case "INLINE_BASE64":
      return {
        ...draft,
        imageFile: {
          dataBase64: image.dataBase64,
          filename: image.filename,
          mimeType: image.mimeType,
        },
      };
    case "UPLOAD_ID":
      return { ...draft, imageUploadId: image.uploadId };
    // The host supplies a temporary bearer download URL. Import immediately
    // through the same bounded, SSRF-protected downloader, and never persist it
    // or the ChatGPT file ID in posts, logs, or tool responses.
    case "OPENAPI_FILE":
      return { ...draft, imageUrl: image.download_url };
  }
}
