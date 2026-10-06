import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { imageUploads, uploadTokens } from "../db/schema";
import { getProject, verifyProjectToken } from "./projects";
import { MAX_IMAGE_BYTES, removeImage, storeImage } from "./storage";
import { readBody } from "./request-body";

const TOKEN_TTL_MINUTES = 60;
const UPLOADS_PER_TOKEN = 20;
const UPLOAD_TTL_MINUTES = 60;
const MAX_UNCLAIMED_UPLOADS = 50;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
function minutesFromNow(minutes: number) {
  return sql.raw(`now() + interval '${minutes} minutes'`);
}
export function appOrigin() {
  return new URL(process.env.APP_URL || "http://localhost:8200").origin;
}
export function uploadEndpoint(projectId: string) {
  return `${appOrigin()}/api/mcp/${projectId}/uploads`;
}
export async function createUploadToken(projectId: string) {
  z.uuid().parse(projectId);
  await getDb()
    .delete(uploadTokens)
    .where(
      and(
        eq(uploadTokens.projectId, projectId),
        lte(uploadTokens.expiresAt, sql`now()`),
      ),
    );
  const token = randomBytes(32).toString("base64url");
  const [row] = await getDb()
    .insert(uploadTokens)
    .values({
      projectId,
      tokenHash: hashToken(token),
      uploadsRemaining: UPLOADS_PER_TOKEN,
      expiresAt: minutesFromNow(TOKEN_TTL_MINUTES),
    })
    .returning();
  const uploadUrl = uploadEndpoint(projectId);
  return {
    uploadUrl,
    token,
    expiresAt: new Date(row.expiresAt).toISOString(),
    maxUploads: UPLOADS_PER_TOKEN,
    maxBytes: MAX_IMAGE_BYTES,
    acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
    example: `curl -sS -X POST --data-binary @image.jpg -H "Content-Type: image/jpeg" -H "Authorization: Bearer ${token}" "${uploadUrl}"`,
    next: "POST each image file to uploadUrl with this token. Each response returns an imageUploadId to pass to create_draft.",
  };
}
// Accepts the project's static MCP token, or spends one use of an upload
// token. Returns a refund callback so rejected images don't burn a use.
async function authorizeUpload(
  projectId: string,
  authorization: string | null,
) {
  let project;
  try {
    project = await getProject(projectId);
  } catch {
    throw new UploadError("Invalid project or token", 401);
  }
  if (verifyProjectToken(project, authorization)) return async () => {};
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new UploadError("Missing upload token", 401);
  const [spent] = await getDb()
    .update(uploadTokens)
    .set({ uploadsRemaining: sql`${uploadTokens.uploadsRemaining} - 1` })
    .where(
      and(
        eq(uploadTokens.tokenHash, hashToken(token)),
        eq(uploadTokens.projectId, projectId),
        gt(uploadTokens.expiresAt, sql`now()`),
        gt(uploadTokens.uploadsRemaining, 0),
      ),
    )
    .returning({ id: uploadTokens.id });
  if (!spent)
    throw new UploadError(
      "Upload token is invalid, expired, or used up. Call create_upload_token for a new one.",
      401,
    );
  return async () => {
    await getDb()
      .update(uploadTokens)
      .set({ uploadsRemaining: sql`${uploadTokens.uploadsRemaining} + 1` })
      .where(eq(uploadTokens.id, spent.id));
  };
}
async function removeExpiredUploads(projectId: string) {
  const expired = await getDb()
    .delete(imageUploads)
    .where(
      and(
        eq(imageUploads.projectId, projectId),
        lte(imageUploads.expiresAt, sql`now()`),
      ),
    )
    .returning();
  for (const upload of expired)
    try {
      await removeImage(upload);
    } catch {
      console.error("Could not clean up an expired image upload");
    }
}
async function uploadBytes(req: Request) {
  const body = await readBody(req, MAX_IMAGE_BYTES + 64 * 1024, "Image");
  const type = req.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data")) return body;
  const form = await new Response(new Uint8Array(body), {
    headers: { "Content-Type": type },
  }).formData();
  const file = form.get("file");
  if (!(file instanceof Blob))
    throw new UploadError(
      'Send the image in a multipart field named "file"',
      400,
    );
  return Buffer.from(await file.arrayBuffer());
}
export async function receiveImageUpload(projectId: string, req: Request) {
  const refund = await authorizeUpload(
    projectId,
    req.headers.get("authorization"),
  );
  try {
    await removeExpiredUploads(projectId);
    const [{ unclaimed }] = await getDb()
      .select({ unclaimed: count() })
      .from(imageUploads)
      .where(eq(imageUploads.projectId, projectId));
    if (unclaimed >= MAX_UNCLAIMED_UPLOADS)
      throw new UploadError(
        "Too many unused image uploads. Create drafts from them or wait for them to expire.",
        429,
      );
    let bytes: Buffer;
    try {
      bytes = await uploadBytes(req);
    } catch (e) {
      if (e instanceof UploadError) throw e;
      throw new UploadError(
        e instanceof Error ? e.message : "Could not read the image",
        413,
      );
    }
    let image;
    try {
      image = await storeImage(projectId, bytes);
    } catch (e) {
      throw new UploadError(
        e instanceof Error ? e.message : "Invalid image",
        400,
      );
    }
    try {
      const [upload] = await getDb()
        .insert(imageUploads)
        .values({
          ...image,
          projectId,
          expiresAt: minutesFromNow(UPLOAD_TTL_MINUTES),
        })
        .returning();
      return {
        imageUploadId: upload.id,
        expiresAt: new Date(upload.expiresAt).toISOString(),
        next: "Pass imageUploadId to create_draft before it expires.",
      };
    } catch (e) {
      await removeImage(image);
      throw e;
    }
  } catch (e) {
    await refund();
    throw e;
  }
}
// Consumes the upload inside the caller's transaction so a failed insert
// leaves it claimable and one upload can never back two posts.
export async function claimImageUpload(
  tx: Tx,
  projectId: string,
  uploadId: string,
) {
  const [upload] = await tx
    .delete(imageUploads)
    .where(
      and(
        eq(imageUploads.projectId, projectId),
        eq(imageUploads.id, uploadId),
        gt(imageUploads.expiresAt, sql`now()`),
      ),
    )
    .returning();
  if (!upload)
    throw new Error("Image upload not found, expired, or already used");
  return { imageKey: upload.imageKey, imageBucket: upload.imageBucket };
}
