import "server-only";
import { listForProject, manage } from "./publications";
import { enqueue, retryFailed } from "./rules";

// Worker operations (queue consumer, recovery cron, local worker) and entry
// points for callers that already authorized the project (legacy routes and
// tests, until they migrate). Never for routers or the UI.

export {
  dispatchPublishingJob,
  processPublishingJob,
  publishingQueue,
  recoverPublishingJobs,
} from "./jobs";
export { toPublicationDto } from "./mappers";

// Queues the post without dispatching; the caller dispatches the jobs.
export const enqueuePublication = enqueue;

export function retryFailedPublication(projectId: string, postId: string) {
  return retryFailed(projectId, postId, async () => {});
}

export const listProjectPublications = listForProject;

export function manageProjectPublication(
  projectId: string,
  id: string,
  action: "refresh" | "edit" | "delete",
  caption?: string,
) {
  return manage(
    projectId,
    id,
    action === "edit" ? { type: "edit", caption: caption! } : { type: action },
  );
}
