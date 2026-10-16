import type { PublicationRow, PublishJob } from "@/db/schema";

// Internal records. Jobs carry a snapshot of the post and its media
// locations; map publications with toPublicationDto before returning them.
export type { PublicationRow, PublishJob };
export type PublishJobPatch = Partial<
  typeof import("@/db/schema").publishJobs.$inferInsert
>;
