import { z } from "zod";
import * as publishing from "@/domain/publishing/system";

// Deprecated adapter: keeps the old signatures for code not yet migrated to
// src/domain/publishing. New code imports the domain module directly.

// Old routes check `instanceof PublicationError` for user-facing failures.
export { UserFacingError as PublicationError } from "@/domain/shared/errors";
export const toPublication = publishing.toPublicationDto;

export async function listPublications(projectId: string, postId?: string) {
  z.uuid().parse(projectId);
  if (postId) z.uuid().parse(postId);
  return publishing.listProjectPublications(projectId, postId);
}

export async function managePublication(
  projectId: string,
  id: string,
  action: "refresh" | "edit" | "delete",
  caption?: string,
) {
  z.uuid().parse(id);
  return publishing.manageProjectPublication(
    projectId,
    id,
    action,
    action === "edit"
      ? z.string().trim().min(1).max(2200).parse(caption)
      : undefined,
  );
}
