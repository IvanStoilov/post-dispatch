import { z } from "zod";
import { publishingSystemService as publishing } from "@/domain/publishing";

// Deprecated adapter: keeps the old signatures for code not yet migrated to
// src/domain/publishing. New code imports the domain module directly.
// Remove each export when its last caller has migrated. Functions stay
// async so validation failures reject, as the old ones did.

export const publishingQueue = publishing.queue;
export const processPublishingJob = publishing.processJob;
export const dispatchPublishingJob = publishing.dispatchJob;
export const recoverPublishingJobs = publishing.recoverJobs;

export async function enqueuePublication(
  projectId: string,
  postId: string,
  authorizedBy: string,
) {
  if (!authorizedBy) throw new Error("Explicit user authorization is required");
  return publishing.enqueue(
    { userId: authorizedBy },
    { projectId: z.uuid().parse(projectId), id: z.uuid().parse(postId) },
  );
}

export async function retryFailedPublication(
  projectId: string,
  postId: string,
) {
  return publishing.retryFailed(
    z.uuid().parse(projectId),
    z.uuid().parse(postId),
  );
}
