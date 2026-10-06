import { z } from "zod";
import { inlineImageFileSchema } from "./storage";
const downloadUrl = z
  .url()
  .refine(
    (value) => new URL(value).protocol === "https:",
    "Use an HTTPS download URL",
  );
// ChatGPT's fileParams contract requires exactly these two required fields;
// both optional metadata properties must also appear in the JSON schema.
export const openaiFileSchema = z
  .object({
    download_url: downloadUrl,
    file_id: z.string().min(1).max(255),
    mime_type: z.string().max(100).optional(),
    file_name: z.string().max(255).optional(),
  })
  .strict();
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
  .object({ ...draftFields, image: mcpImageSchema.optional() })
  .strict();
export const fileDraftSchema = z
  .object({ ...draftFields, image: openaiFileSchema })
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
