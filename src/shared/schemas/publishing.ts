import { z } from "zod";
import { postRef } from "./post";

// Inputs for publishing posts and managing their published copies.
// Browser-safe.

// Publish or retry a post: the same reference as other post actions.
export const publishPostInput = postRef;
export type PublishPostInput = z.output<typeof publishPostInput>;

export const listPublicationsInput = z.object({
  projectId: z.uuid(),
  postId: z.uuid().optional(),
});
export type ListPublicationsInput = z.output<typeof listPublicationsInput>;

export const publicationRef = z.object({
  projectId: z.uuid(),
  id: z.uuid(),
});
export type PublicationRef = z.output<typeof publicationRef>;

export const editPublicationInput = publicationRef.extend({
  caption: z.string().trim().min(1).max(2200),
});
export type EditPublicationInput = z.output<typeof editPublicationInput>;
