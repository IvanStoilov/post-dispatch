import { z } from "zod";
import * as publishing from "@/domain/publishing/system";

// Deprecated adapter: keeps the old signatures for code not yet migrated to
// src/domain/publishing. New code imports the domain module directly.
// Remove each export when its last caller has migrated. Functions stay
// async so validation failures reject, as the old ones did.

export {
  dispatchPublishingJob,
  processPublishingJob,
  publishingQueue,
  recoverPublishingJobs,
} from "@/domain/publishing/system";

export async function enqueuePublication(
  projectId: string,
  postId: string,
  authorizedBy: string,
) {
  if (!authorizedBy) throw new Error("Explicit user authorization is required");
  return publishing.enqueuePublication(
    { userId: authorizedBy },
    { projectId: z.uuid().parse(projectId), id: z.uuid().parse(postId) },
  );
}

export async function retryFailedPublication(
  projectId: string,
  postId: string,
) {
  return publishing.retryFailedPublication(
    z.uuid().parse(projectId),
    z.uuid().parse(postId),
  );
}
