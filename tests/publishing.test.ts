import test from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { posts } from "../src/db/schema";
import {
  createPost as insertPost,
  listPosts,
  editPost,
  deletePost,
  claimPost,
} from "../src/lib/store";
import { publishPost } from "../src/lib/meta";
import type { Platform } from "../src/lib/types";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const createdIds: string[] = [];
const source = "Test " + randomUUID();
async function createPost(input: unknown) {
  const p = await insertPost({ ...(input as Record<string, unknown>), source });
  createdIds.push(p.id);
  return p;
}
const realFetch = globalThis.fetch;
const draft: {
  title: string;
  caption: string;
  platforms: Platform[];
  imageUrl: string;
} = {
  title: "Test post",
  caption: "Test caption",
  platforms: ["facebook", "instagram"],
  imageUrl: "https://example.com/test.jpg",
};
test(
  "Postgres storage and publishing",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const savedEnvironment = Object.fromEntries(
      [
        "FACEBOOK_PAGE_ID",
        "FACEBOOK_PAGE_TOKEN",
        "INSTAGRAM_ACCOUNT_ID",
        "INSTAGRAM_ACCESS_TOKEN",
      ].map((key) => [key, process.env[key]]),
    );
    try {
      await t.test(
        "validates, saves, edits, and reloads posts from a new pool",
        async () => {
          await assert.rejects(
            () => createPost({ ...draft, imageUrl: "" }),
            /Instagram requires/,
          );
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          await editPost(p.id, {
            ...draft,
            title: "Updated database draft",
            platforms: ["facebook"],
          });
          await closeDb();
          const reloaded = (await listPosts()).find((row) => row.id === p.id)!;
          assert.equal(reloaded.title, "Updated database draft");
          assert.equal(reloaded.createdAt, p.createdAt);
          await deletePost(p.id);
          assert.ok(!(await listPosts()).some((row) => row.id === p.id));
        },
      );
      await t.test(
        "missing channel configuration rolls back the publishing claim",
        async () => {
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          await assert.rejects(
            () => claimPost(p.id, { facebook: false, instagram: false }),
            /Connect facebook/,
          );
          assert.equal(
            (await listPosts()).find((row) => row.id === p.id)!.status,
            "draft",
          );
        },
      );
      await t.test("database enforces required Instagram media", async () => {
        const p = await createPost(draft);
        await assert.rejects(() =>
          getDb().update(posts).set({ imageUrl: "" }).where(eq(posts.id, p.id)),
        );
      });
      await t.test("parallel inserts keep every post", async () => {
        const inserted = await Promise.all(
          Array.from({ length: 6 }, () =>
            createPost({ ...draft, platforms: ["facebook"] }),
          ),
        );
        const persisted = new Set((await listPosts()).map((p) => p.id));
        assert.ok(inserted.every((p) => persisted.has(p.id)));
      });
      process.env.FACEBOOK_PAGE_ID = "page";
      process.env.FACEBOOK_PAGE_TOKEN = "fake-token";
      process.env.INSTAGRAM_ACCOUNT_ID = "instagram";
      process.env.INSTAGRAM_ACCESS_TOKEN = "fake-token";
      const calls: { url: string; body: Record<string, string> }[] = [];
      globalThis.fetch = async (url, options) => {
        calls.push({
          url: String(url),
          body: Object.fromEntries(options!.body as URLSearchParams),
        });
        return Response.json({ id: "id-" + calls.length });
      };
      await t.test(
        "publishes both channels and saves real response IDs",
        async () => {
          const p = await createPost(draft);
          const result = await publishPost(p.id);
          assert.equal(result.status, "published");
          await assert.rejects(
            () => editPost(p.id, draft),
            /no longer editable/,
          );
          await assert.rejects(() => deletePost(p.id), /no longer deletable/);
          assert.deepEqual(result.results, {
            facebook: "id-1",
            instagram: "id-3",
          });
          assert.equal(calls[0].body.caption, "Test caption");
          assert.equal(calls[1].body.image_url, draft.imageUrl);
          assert.equal(calls[2].body.creation_id, "id-2");
          await assert.rejects(
            () => publishPost(p.id),
            /already been submitted/,
          );
          assert.equal(calls.length, 3);
        },
      );
      await t.test(
        "partial failure retains successful channel ID and stops retry",
        async () => {
          let n = 0;
          globalThis.fetch = async () => {
            n++;
            return n === 1
              ? Response.json({ id: "facebook-success" })
              : Response.json(
                  { error: { message: "Permission denied" } },
                  { status: 403 },
                );
          };
          const p = await createPost(draft);
          await assert.rejects(() => publishPost(p.id), /Permission denied/);
          const saved = (await listPosts()).find((post) => post.id === p.id);
          assert.equal(saved!.status, "needs_review");
          assert.equal(saved!.results.facebook, "facebook-success");
          await assert.rejects(
            () => publishPost(p.id),
            /already been submitted/,
          );
          assert.equal(n, 2);
        },
      );
      await t.test(
        "concurrent publish requests send exactly one post",
        async () => {
          let n = 0;
          globalThis.fetch = async () => {
            n++;
            return Response.json({ id: "once" });
          };
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          const results = await Promise.allSettled([
            publishPost(p.id),
            publishPost(p.id),
          ]);
          assert.equal(
            results.filter((r) => r.status === "fulfilled").length,
            1,
          );
          assert.equal(n, 1);
        },
      );
      await t.test(
        "uncertain transport failure requires manual review",
        async () => {
          globalThis.fetch = async () => {
            throw new Error("Timed out after remote submission");
          };
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          await assert.rejects(() => publishPost(p.id), /Timed out/);
          assert.equal(
            (await listPosts()).find((post) => post.id === p.id)!.status,
            "needs_review",
          );
        },
      );
    } finally {
      globalThis.fetch = realFetch;
      try {
        if (createdIds.length)
          await getDb().delete(posts).where(inArray(posts.id, createdIds));
      } finally {
        await closeDb();
        for (const [key, value] of Object.entries(savedEnvironment)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  },
);
