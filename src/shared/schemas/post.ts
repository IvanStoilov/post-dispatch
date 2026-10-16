import { z } from "zod";
import { platforms } from "../platforms";
import { assetKinds, editableAssetSchema } from "./asset";
import { publicationDto } from "./publication";

// Inputs and DTOs for posts. Browser-safe.

const projectId = z.uuid();
const postId = z.uuid();

// A draft as written in the editor or sent by an assistant.
export const draftFields = z.object({
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().min(1).max(2200),
  platforms: z
    .array(z.enum(platforms))
    .min(1)
    .max(platforms.length)
    .transform((value) => [...new Set(value)]),
  source: z.string().trim().min(1).max(60).default("Manual"),
  // Omitted when editing: keep the current media unchanged.
  assets: z.array(editableAssetSchema).max(10).optional(),
});
export type DraftFields = z.output<typeof draftFields>;

const instagramNeedsMedia = (draft: DraftFields) =>
  !draft.platforms.includes("instagram") || !!draft.assets?.length;

export const listPostsInput = z.object({ projectId });
export type ListPostsInput = z.output<typeof listPostsInput>;

export const createPostInput = draftFields
  .extend({ projectId })
  .refine(instagramNeedsMedia, {
    message: "Instagram requires an image or video",
    path: ["assets"],
  });
export type CreatePostInput = z.output<typeof createPostInput>;

export const updatePostInput = draftFields.extend({ projectId, id: postId });
export type UpdatePostInput = z.output<typeof updatePostInput>;

export const postRef = z.object({ projectId, id: postId });
export type PostRef = z.output<typeof postRef>;

export const postAssetDto = z.object({
  id: z.uuid(),
  kind: z.enum(assetKinds),
  url: z.string(),
  mimeType: z.string(),
});
export type PostAssetDto = z.output<typeof postAssetDto>;

export const postStatuses = [
  "draft",
  "publishing",
  "published",
  "needs_review",
] as const;
export const deliveryStatuses = [
  "queued",
  "preparing",
  "waiting",
  "submitting",
  "published",
  "failed",
  "needs_review",
] as const;

export const postDto = z.object({
  id: postId,
  projectId,
  title: z.string(),
  caption: z.string(),
  imageUrl: z.string(),
  assets: z.array(postAssetDto),
  platforms: z.array(z.enum(platforms)),
  source: z.string(),
  status: z.enum(postStatuses),
  createdAt: z.iso.datetime({ offset: true }),
  results: z.partialRecord(z.enum(platforms), z.string()),
  publications: z.array(publicationDto).optional(),
  error: z.string().optional(),
  deliveries: z
    .array(
      z.object({
        platform: z.enum(platforms),
        status: z.enum(deliveryStatuses),
        error: z.string().nullable(),
      }),
    )
    .optional(),
});
export type PostDto = z.output<typeof postDto>;
