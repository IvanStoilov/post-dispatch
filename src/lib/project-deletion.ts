import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  users,
  projects,
  posts,
  postAssets,
  publishJobs,
  imageUploads,
  directUploads,
  verifications,
  accountMediaCleanup,
} from "../db/schema";
import { newStorageLocation } from "./storage/index";
import type { StorageLocation } from "./storage/types";
import { pendingConnectionBelongsTo } from "./connector-connect";
import { loggedOperation, logger } from "./logger";
import { UserFacingError, type UserFacingStatus } from "./errors";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export class DataDeletionError extends UserFacingError {
  constructor(message: string, status: UserFacingStatus = 409) {
    super(message, status);
  }
}

// Caller must lock the user and the owned project rows first, in that order.
export async function deleteProjectData(
  tx: Tx,
  owned: { id: string }[],
  configuredLocation?: Omit<StorageLocation, "imageKey">,
  scope: "project" | "account" = "project",
) {
  const ids = owned.map((p) => p.id);
  if (ids.length) {
    const jobs = await tx
      .select()
      .from(publishJobs)
      .where(inArray(publishJobs.projectId, ids))
      .orderBy(publishJobs.id)
      .for("update");
    if (
      jobs.some(
        (job) =>
          job.status === "submitting" ||
          (job.leaseExpiresAt && job.leaseExpiresAt > new Date()),
      )
    )
      throw new DataDeletionError(
        `A publication is currently being processed. Wait for it to finish before deleting ${scope === "account" ? "your account" : "this project"}. If it remains stuck, contact support.`,
      );
    const drafts = await tx
      .select()
      .from(posts)
      .where(inArray(posts.projectId, ids))
      .orderBy(posts.id)
      .for("update");
    const unclaimed = await tx
      .select()
      .from(imageUploads)
      .where(inArray(imageUploads.projectId, ids))
      .for("update");
    const pending = await tx
      .select()
      .from(directUploads)
      .where(inArray(directUploads.projectId, ids))
      .for("update");
    const assets = drafts.length
      ? await tx
          .select({
            projectId: posts.projectId,
            imageBucket: postAssets.imageBucket,
            imageKey: postAssets.imageKey,
            storageProvider: postAssets.storageProvider,
          })
          .from(postAssets)
          .innerJoin(posts, eq(posts.id, postAssets.postId))
          .where(inArray(posts.projectId, ids))
      : [];
    const media = [...assets, ...unclaimed, ...pending];
    const targets = owned.flatMap((project) => {
      const objects = media.filter((m) => m.projectId === project.id);
      const locations = new Map(
        objects.map((object) => [
          `${object.storageProvider}:${object.imageBucket}`,
          {
            storageProvider: object.storageProvider,
            imageBucket: object.imageBucket,
          },
        ]),
      );
      if (configuredLocation) {
        locations.set(
          `${configuredLocation.storageProvider}:${configuredLocation.imageBucket}`,
          configuredLocation,
        );
      }
      return [...locations.values()].map((location) => ({
        bucket: location.imageBucket,
        storageProvider: location.storageProvider,
        prefix: `${project.id}/`,
        objectKeys: [
          ...new Set(
            objects
              .filter(
                (m) =>
                  m.storageProvider === location.storageProvider &&
                  m.imageBucket === location.imageBucket,
              )
              .map((m) => m.imageKey),
          ),
        ],
        finalSweepAfter: new Date(Date.now() + 60 * 60000),
      }));
    });
    if (targets.length) await tx.insert(accountMediaCleanup).values(targets);
    await tx.delete(publishJobs).where(inArray(publishJobs.projectId, ids));
    await tx.delete(directUploads).where(inArray(directUploads.projectId, ids));
    await tx.delete(imageUploads).where(inArray(imageUploads.projectId, ids));
    await tx.delete(posts).where(inArray(posts.projectId, ids));
    await tx.delete(projects).where(inArray(projects.id, ids));
  }
}

export async function deleteOwnProject(
  userId: string,
  projectId: string,
  confirmation: string,
) {
  return loggedOperation("project.delete", { userId, projectId }, async () => {
    const configuredLocation = await newStorageLocation();
    await getDb().transaction(async (tx) => {
      const [user] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .for("update");
      if (!user) throw new DataDeletionError("Sign in to continue.", 401);
      const [project] = await tx
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
        .for("update");
      if (!project) throw new DataDeletionError("Project not found.", 404);
      if (confirmation !== project.name)
        throw new DataDeletionError(
          "Enter the current project name exactly to confirm deletion.",
          400,
        );
      await deleteProjectData(tx, [project], configuredLocation);
      const pending = await tx.select().from(verifications);
      const ids = pending
        .filter(
          (record) =>
            record.identifier.startsWith("meta-connect:") &&
            pendingConnectionBelongsTo(record.value, userId, projectId),
        )
        .map((record) => record.id);
      if (ids.length)
        await tx.delete(verifications).where(inArray(verifications.id, ids));
    });
    logger.info("project.deleted", { userId, projectId });
  });
}
