import { loadEnvConfig } from "@next/env";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { posts, postAssets } from "../src/db/schema";
import { uploadImage, removeImage } from "../src/lib/storage";
import { randomUUID } from "node:crypto";
loadEnvConfig(process.cwd());
async function main() {
  const legacy = await getDb()
    .select()
    .from(posts)
    .where(and(ne(posts.imageUrl, ""), ne(posts.status, "publishing")));
  let migrated = 0,
    failed = 0;
  for (const post of legacy) {
    let image: Awaited<ReturnType<typeof uploadImage>> | undefined;
    try {
      image = await uploadImage(post.projectId, { imageUrl: post.imageUrl });
      const media = image;
      const changed = await getDb().transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(posts)
          .where(eq(posts.id, post.id))
          .for("update");
        if (
          !current ||
          current.imageUrl !== post.imageUrl ||
          current.status === "publishing"
        )
          return false;
        const [existing] = await tx
          .select({ id: postAssets.id })
          .from(postAssets)
          .where(eq(postAssets.postId, post.id))
          .limit(1);
        if (existing) return false;
        await tx
          .insert(postAssets)
          .values({
            id: randomUUID(),
            postId: post.id,
            position: 0,
            kind: "IMAGE",
            mimeType: "image/jpeg",
            ...media,
          });
        await tx
          .update(posts)
          .set({ imageUrl: "", updatedAt: sql`now()` })
          .where(eq(posts.id, post.id));
        return true;
      });
      if (!changed) {
        await removeImage(image);
        image = undefined;
        continue;
      }
      migrated++;
    } catch {
      failed++;
      if (image) await removeImage(image);
      console.error(
        `Could not migrate image for post ${post.id}; existing URL retained.`,
      );
    }
  }
  console.log(JSON.stringify({ migrated, failed }));
  if (failed) process.exitCode = 1;
}
main()
  .catch(() => {
    console.error("Image migration failed");
    process.exitCode = 1;
  })
  .finally(closeDb);
