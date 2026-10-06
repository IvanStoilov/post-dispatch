import { loadEnvConfig } from "@next/env";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { posts } from "../src/db/schema";
import { uploadImage, removeImage } from "../src/lib/storage";
loadEnvConfig(process.cwd());
async function main() {
  const legacy = await getDb()
    .select()
    .from(posts)
    .where(
      and(
        isNull(posts.imageKey),
        ne(posts.imageUrl, ""),
        ne(posts.status, "publishing"),
      ),
    );
  let migrated = 0,
    failed = 0;
  for (const post of legacy) {
    let image: Awaited<ReturnType<typeof uploadImage>> | undefined;
    try {
      image = await uploadImage(post.projectId, { imageUrl: post.imageUrl });
      const changed = await getDb()
        .update(posts)
        .set({ ...image, imageUrl: "", updatedAt: sql`now()` })
        .where(
          and(
            eq(posts.id, post.id),
            eq(posts.imageUrl, post.imageUrl),
            isNull(posts.imageKey),
            ne(posts.status, "publishing"),
          ),
        )
        .returning({ id: posts.id });
      if (!changed.length) {
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
