import { scheduleMediaCleanupRecovery } from "./account-deletion";
import { deleteOwnProject } from "./project-deletion";

// Deletes a project and schedules removal of its stored media after the
// response. Separate module to avoid an import cycle between the two above.
export async function deleteProject(
  userId: string,
  projectId: string,
  confirmation: string,
) {
  await deleteOwnProject(userId, projectId, confirmation);
  await scheduleMediaCleanupRecovery("project.media_cleanup.recovery.failed");
}
