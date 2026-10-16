import { z } from "zod";
import { platforms } from "../platforms";

// A post as it went live on a network. Browser-safe.
export const publicationDto = z.object({
  id: z.uuid(),
  postId: z.uuid().nullable(),
  projectId: z.uuid(),
  platform: z.enum(platforms),
  accountId: z.string().nullable(),
  remotePostId: z.string(),
  permalink: z.string().nullable(),
  caption: z.string(),
  mediaKind: z.string(),
  publishedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["published", "deleted", "unavailable"]),
  metrics: z.record(z.string(), z.number()),
  refreshedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type PublicationDto = z.output<typeof publicationDto>;
