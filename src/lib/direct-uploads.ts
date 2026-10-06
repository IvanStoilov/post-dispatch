import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, gt, lte, sql, count } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { directUploads, imageUploads } from "../db/schema";
import {
  stagedUploadUrl,
  readStagedUpload,
  storeAsset,
  removeImage,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "./storage";
import { appOrigin, removeExpiredUploads } from "./uploads";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const directUploadSchema = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4"]),
    fileSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  })
  .strict()
  .refine(
    (v) => v.mimeType === "video/mp4" || v.fileSize <= MAX_IMAGE_BYTES,
    "Images must be 4.5 MB or smaller",
  );
export async function createDirectUpload(projectId: string, input: unknown) {
  z.uuid().parse(projectId);
  const data = directUploadSchema.parse(input);
  await removeExpiredUploads(projectId);
  const expired = await getDb()
    .delete(directUploads)
    .where(
      and(
        eq(directUploads.projectId, projectId),
        lte(directUploads.expiresAt, sql`now()`),
      ),
    )
    .returning();
  for (const object of expired)
    await removeImage(object).catch(() =>
      console.error("Could not clean up an expired media upload"),
    );
  const [{ total }] = await getDb()
    .select({ total: count() })
    .from(directUploads)
    .where(
      and(
        eq(directUploads.projectId, projectId),
        eq(directUploads.completed, false),
      ),
    );
  const [{ unclaimed }] = await getDb()
    .select({ unclaimed: count() })
    .from(imageUploads)
    .where(eq(imageUploads.projectId, projectId));
  if (total + unclaimed >= 50)
    throw new Error(
      "Too many unused media uploads. Use them in drafts or let them expire.",
    );
  const target = await stagedUploadUrl(projectId, data.mimeType, data.fileSize);
  const completionToken = randomBytes(32).toString("base64url");
  const [upload] = await getDb()
    .insert(directUploads)
    .values({
      projectId,
      imageKey: target.imageKey,
      imageBucket: target.imageBucket,
      ...data,
      completionTokenHash: hash(completionToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    })
    .returning();
  return {
    uploadId: upload.id,
    uploadUrl: target.uploadUrl,
    method: "PUT",
    headers: { "Content-Type": data.mimeType },
    uploadExpiresAt: new Date(Date.now() + 600000).toISOString(),
    completionToken,
    completionUrl: `${appOrigin()}/api/mcp/${projectId}/uploads/complete`,
    next: "PUT the exact file bytes to uploadUrl with the provided Content-Type header. Then call complete_asset_upload with uploadId and completionToken, or POST those fields to completionUrl. Use the returned assetUploadId in create_draft.assets with type UPLOAD_ID. Upload each image separately; a post allows up to 10 images or one video.",
  };
}
export async function completeDirectUpload(
  projectId: string,
  uploadId: string,
  completionToken?: string,
) {
  z.uuid().parse(projectId);
  z.uuid().parse(uploadId);
  let stored: Awaited<ReturnType<typeof storeAsset>> | undefined;
  let pending: { imageKey: string; imageBucket: string } | undefined;
  try {
    const result = await getDb().transaction(async (tx) => {
      const [upload] = await tx
        .select()
        .from(directUploads)
        .where(
          and(
            eq(directUploads.id, uploadId),
            eq(directUploads.completed, false),
            eq(directUploads.projectId, projectId),
            gt(directUploads.expiresAt, sql`now()`),
          ),
        )
        .for("update");
      if (!upload)
        throw new Error("Upload not found, expired, or already completed");
      if (
        completionToken !== undefined &&
        !timingSafeEqual(
          Buffer.from(hash(completionToken)),
          Buffer.from(upload.completionTokenHash),
        )
      )
        throw new Error("Invalid upload completion token");
      // Re-encode images or copy videos to a NEW key. The uploader can never
      // mutate a post by reusing the still-valid PUT URL after finalization.
      stored = await storeAsset(
        projectId,
        await readStagedUpload(upload),
        upload.mimeType === "video/mp4" ? "VIDEO" : "IMAGE",
      );
      const [ready] = await tx
        .insert(imageUploads)
        .values({
          projectId,
          imageKey: stored.imageKey,
          imageBucket: stored.imageBucket,
          kind: stored.kind,
          mimeType: stored.mimeType,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
        .returning();
      await tx
        .update(directUploads)
        .set({ completed: true })
        .where(eq(directUploads.id, uploadId));
      pending = upload;
      return {
        assetUploadId: ready.id,
        imageUploadId: ready.id,
        kind: ready.kind,
        expiresAt: ready.expiresAt,
      };
    });
    if (pending)
      await removeImage(pending).catch(() =>
        console.error("Could not clean up staged media"),
      );
    return result;
  } catch (error) {
    if (stored)
      await removeImage(stored).catch(() =>
        console.error("Could not clean up rejected media"),
      );
    throw error;
  }
}
