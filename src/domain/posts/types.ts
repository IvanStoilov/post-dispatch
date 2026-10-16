import type { PostRow } from "@/db/schema";
import type { StoredAsset } from "@/lib/types";
import type { PostDto } from "@/shared/schemas/post";

// A post with its stored media and delivery state, as loaded from the
// database. Holds storage locations: map it with toPostDto before it leaves
// the domain.
export type PostRecord = PostRow & {
  assets: StoredAsset[];
  imageKey: string | null;
  imageBucket: string | null;
  storageProvider: StoredAsset["storageProvider"] | null;
  deliveries?: PostDto["deliveries"];
  publications?: PostDto["publications"];
};
