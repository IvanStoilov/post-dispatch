import "server-only";
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { getDb } from "@/db";
import { loggedOperation, logger } from "@/lib/logger";
import { appOrigin } from "@/lib/origins";
import {
  MAX_IMAGE_BYTES,
  MediaInputError,
  readStagedUpload,
  removeImage,
  storeAsset,
} from "@/lib/storage";
import { newStorageLocation, storageProvider } from "@/lib/storage/index";
import type { StorageLocation } from "@/lib/storage/types";
import type { StoredAsset } from "@/lib/types";
import type {
  AssetUploadDto,
  CompleteUploadInput,
  CompleteUploadWithTokenInput,
  CreateUploadTokenInput,
  StartUploadInput,
  UploadTargetDto,
  UploadTokenDto,
} from "@/shared/schemas/upload";
import { projectsSystemService } from "../projects";
import type { Actor } from "../shared/actor";
import type { Tx } from "../shared/db";
import { UserFacingError } from "../shared/errors";
import { toAssetUploadDto } from "./mappers";
import * as repository from "./repository";

// All business logic for media uploads. A file reaches storage in one of
// two ways, then waits as an image upload until one draft claims it:
// - direct: start() returns a short-lived PUT URL, complete() checks and
//   re-stores what arrived (browser, and assistants that can make HTTP
//   requests);
// - token: assistants POST bytes with a project-bound upload token.
//
// Besides session use cases (an Actor), the user service has use cases
// authorized by a capability instead: an upload token, a completion token,
// or the unguessable ID in a local upload URL. They enforce access
// themselves, so transports may call them without a session.

const TOKEN_TTL_MINUTES = 60;
const UPLOADS_PER_TOKEN = 20;
const UPLOAD_TTL_MINUTES = 60;
const DIRECT_UPLOAD_TTL_MINUTES = 60;
const MAX_UNUSED_UPLOADS = 50;

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
const invalid = (message: string) => new UserFacingError(message, 400);
const projectNotFound = () => new UserFacingError("Project not found", 404);

async function assertOwned(actor: Actor, projectId: string) {
  if (!(await projectsSystemService.isOwned(actor.userId, projectId)))
    throw projectNotFound();
}

// Storage's rejections of the file itself become a user-facing 400.
async function withMediaErrors<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof MediaInputError) throw invalid(error.message);
    throw error;
  }
}

async function cleanup(media: StorageLocation, reason: string) {
  await removeImage(media).catch((error) =>
    logger.warn("storage.cleanup.failure", { reason, error }),
  );
}

// Expired uploads are removed lazily, before new ones are counted.
async function removeExpired(projectId: string) {
  for (const upload of await repository.deleteExpiredImageUploads(projectId))
    await cleanup(upload, "Could not clean up an expired image upload");
  for (const upload of await repository.deleteExpiredDirectUploads(projectId))
    await cleanup(upload, "Could not clean up an expired media upload");
}

async function assertRoom(projectId: string) {
  await removeExpired(projectId);
  if ((await repository.countUnused(projectId)) >= MAX_UNUSED_UPLOADS)
    throw new UserFacingError(
      "Too many unused media uploads. Use them in drafts or let them expire.",
      429,
    );
}

// Re-encodes images and copies videos from the staged file to a NEW key,
// so the still-valid PUT URL can never change a finished upload.
async function finish(
  projectId: string,
  uploadId: string,
  completionToken?: string,
): Promise<AssetUploadDto> {
  let stored: StoredAsset | undefined;
  let staged: StorageLocation | undefined;
  try {
    const ready = await withMediaErrors(() =>
      getDb().transaction(async (tx) => {
        const upload = await repository.lockOpenDirectUpload(tx, uploadId, {
          projectId,
        });
        if (!upload)
          throw new UserFacingError(
            "Upload not found, expired, or already completed",
            404,
          );
        if (
          completionToken !== undefined &&
          !timingSafeEqual(
            Buffer.from(hash(completionToken)),
            Buffer.from(upload.completionTokenHash),
          )
        )
          throw new UserFacingError("Invalid upload completion token", 403);
        stored = await storeAsset(
          projectId,
          await readStagedUpload(upload),
          upload.mimeType === "video/mp4" ? "VIDEO" : "IMAGE",
          upload.storageProvider,
        );
        const ready = await repository.insertImageUpload(
          {
            projectId,
            imageKey: stored.imageKey,
            imageBucket: stored.imageBucket,
            storageProvider: stored.storageProvider,
            kind: stored.kind,
            mimeType: stored.mimeType,
          },
          UPLOAD_TTL_MINUTES,
          tx,
        );
        await repository.markCompleted(tx, uploadId);
        staged = upload;
        return ready;
      }),
    );
    if (staged) await cleanup(staged, "Could not clean up staged media");
    return toAssetUploadDto(ready);
  } catch (error) {
    if (stored) await cleanup(stored, "Could not clean up rejected media");
    throw error;
  }
}

// Session use cases.

async function createToken(
  actor: Actor,
  { projectId }: CreateUploadTokenInput,
): Promise<UploadTokenDto> {
  return loggedOperation(
    "domain.uploads.createToken",
    { ...actor, projectId },
    async () => {
      await assertOwned(actor, projectId);
      await repository.deleteExpiredTokens(projectId);
      const token = randomBytes(32).toString("base64url");
      const row = await repository.insertToken(
        projectId,
        hash(token),
        UPLOADS_PER_TOKEN,
        TOKEN_TTL_MINUTES,
      );
      const uploadUrl = `${appOrigin()}/api/mcp/uploads?projectId=${projectId}`;
      return {
        uploadUrl,
        token,
        expiresAt: new Date(row.expiresAt).toISOString(),
        maxUploads: UPLOADS_PER_TOKEN,
        maxBytes: MAX_IMAGE_BYTES,
        acceptedTypes: ["image/jpeg", "image/png", "image/webp"],
        example: `curl -sS -X POST --data-binary @image.jpg -H "Content-Type: image/jpeg" -H "Authorization: Bearer ${token}" "${uploadUrl}"`,
        next: 'POST each image file to uploadUrl with this token. Each response returns an imageUploadId; pass it to create_draft as assets: [{ type: "UPLOAD_ID", uploadId: imageUploadId }].',
      };
    },
  );
}

async function start(
  actor: Actor,
  { projectId, ...file }: StartUploadInput,
): Promise<UploadTargetDto> {
  return loggedOperation(
    "domain.uploads.start",
    { ...actor, projectId },
    async () => {
      await assertOwned(actor, projectId);
      await assertRoom(projectId);
      const target = {
        ...(await newStorageLocation()),
        imageKey: `${projectId}/pending/${randomUUID()}`,
      };
      const uploadId = randomUUID();
      const uploadUrl = await storageProvider(
        target.storageProvider,
      ).createUploadUrl({
        bucket: target.imageBucket,
        key: target.imageKey,
        uploadId,
        ...file,
      });
      const completionToken = randomBytes(32).toString("base64url");
      await repository.insertDirectUpload(
        {
          id: uploadId,
          projectId,
          ...target,
          ...file,
          completionTokenHash: hash(completionToken),
        },
        DIRECT_UPLOAD_TTL_MINUTES,
      );
      return {
        uploadId,
        uploadUrl,
        method: "PUT",
        headers: { "Content-Type": file.mimeType },
        uploadExpiresAt: new Date(Date.now() + 600000).toISOString(),
        completionToken,
        completionUrl: `${appOrigin()}/api/mcp/uploads/complete?projectId=${projectId}`,
        next: "PUT the exact file bytes to uploadUrl with the provided Content-Type header. Then call complete_asset_upload with uploadId and completionToken, or POST those fields to completionUrl. Use the returned assetUploadId in create_draft.assets with type UPLOAD_ID. Upload each image separately; a post allows up to 10 images or one video.",
      };
    },
  );
}

// The completion token is optional with a session: the actor's ownership
// already proves the upload. Assistants send it anyway.
async function complete(
  actor: Actor,
  {
    projectId,
    uploadId,
    completionToken,
  }: CompleteUploadInput & { completionToken?: string },
): Promise<AssetUploadDto> {
  return loggedOperation(
    "domain.uploads.complete",
    { ...actor, projectId },
    async () => {
      await assertOwned(actor, projectId);
      return finish(projectId, uploadId, completionToken);
    },
  );
}

// Capability use cases.

async function completeWithToken({
  projectId,
  uploadId,
  completionToken,
}: CompleteUploadWithTokenInput): Promise<AssetUploadDto> {
  return loggedOperation(
    "domain.uploads.completeWithToken",
    { projectId },
    () => finish(projectId, uploadId, completionToken),
  );
}

// Stores an image POSTed with an upload token. Each upload spends one use
// of the token; a rejected one gives it back. The body is read only after
// the token is accepted.
async function receiveWithToken(
  { projectId, token }: { projectId: string; token: string | undefined },
  readBytes: () => Promise<Buffer>,
): Promise<AssetUploadDto> {
  return loggedOperation(
    "domain.uploads.receiveWithToken",
    { projectId },
    async () => {
      const spent = token
        ? await repository.spendToken(projectId, hash(token))
        : undefined;
      if (!spent)
        throw new UserFacingError(
          token
            ? "Upload token is invalid, expired, or used up. Call create_upload_token for a new one."
            : "Missing upload token",
          401,
        );
      try {
        await assertRoom(projectId);
        const image = await withMediaErrors(async () =>
          storeAsset(projectId, await readBytes()),
        );
        try {
          const upload = await repository.insertImageUpload(
            {
              projectId,
              imageKey: image.imageKey,
              imageBucket: image.imageBucket,
              storageProvider: image.storageProvider,
              kind: image.kind,
              mimeType: image.mimeType,
            },
            UPLOAD_TTL_MINUTES,
          );
          return {
            ...toAssetUploadDto(upload),
            next: 'Pass assets: [{ type: "UPLOAD_ID", uploadId: assetUploadId }] to create_draft before it expires.',
          };
        } catch (error) {
          await cleanup(image, "Could not clean up an unregistered upload");
          throw error;
        }
      } catch (error) {
        await repository.refundToken(spent);
        throw error;
      }
    },
  );
}

// Local storage's stand-in for an S3 presigned PUT: the upload ID in the
// URL is the capability. The file must match the declared type and size.
async function writeLocalFile(
  { uploadId, contentType }: { uploadId: string; contentType: string },
  readBytes: (limit: number) => Promise<Buffer>,
): Promise<void> {
  return loggedOperation("domain.uploads.writeLocalFile", {}, () =>
    getDb().transaction(async (tx) => {
      const upload = await repository.lockOpenDirectUpload(tx, uploadId, {
        storageProvider: "local",
      });
      if (!upload) throw new UserFacingError("Upload unavailable", 404);
      if (contentType !== upload.mimeType)
        throw invalid("Upload content type does not match");
      const bytes = await readBytes(upload.fileSize);
      if (bytes.length !== upload.fileSize)
        throw invalid("Upload size does not match");
      await storageProvider(upload.storageProvider).write(
        { bucket: upload.imageBucket, key: upload.imageKey },
        bytes,
        upload.mimeType,
      );
    }),
  );
}

// System operations.

// Consumes the upload inside the caller's transaction (creating or editing
// a post), so a failed write leaves it claimable and one upload can never
// back two posts.
async function claim(
  tx: Tx,
  projectId: string,
  uploadId: string,
): Promise<StoredAsset> {
  const upload = await repository.claimImageUpload(tx, projectId, uploadId);
  if (!upload)
    throw invalid("Image upload not found, expired, or already used");
  return {
    id: upload.id,
    kind: upload.kind,
    mimeType: upload.kind === "VIDEO" ? "video/mp4" : "image/jpeg",
    imageKey: upload.imageKey,
    imageBucket: upload.imageBucket,
    storageProvider: upload.storageProvider,
  };
}

// For routers, pages, MCP tools and upload routes.
export const uploadsService = {
  createToken,
  start,
  complete,
  completeWithToken,
  receiveWithToken,
  writeLocalFile,
};

// For workers and other domain modules only: these skip user
// authorization. Lint forbids them in routers and UI.
export const uploadsSystemService = {
  claim,
  // Project deletion: deletes the projects' uploads in its transaction and
  // returns their stored media for cleanup.
  deleteInProjects: repository.deleteInProjects,
};
