import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, closeDb } from "../src/db";
import { posts } from "../src/db/schema";
import { client, rejectsWith, sent, testUsers } from "./helpers/orpc";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const draft = {
  title: "Pricing update",
  caption: "We raised prices 30% last month.",
  platforms: ["facebook" as const],
};

test(
  "posts procedures require a session",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await rejectsWith(
      client().posts.list({ projectId: randomUUID() }),
      "UNAUTHORIZED",
    );
  },
);

test(
  "posts procedures manage a project's drafts",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const users = testUsers();
    try {
      const a = await users.signedIn(),
        b = await users.signedIn();
      const { id: projectId } = await a.projects.create({ name: "Posts" });
      const image = (
        await sharp({
          create: { width: 64, height: 64, channels: 3, background: "#ffc531" },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64");
      let textPost = "",
        imagePost = "";

      await t.test("create stores a draft and returns its DTO", async () => {
        sent.length = 0;
        const post = await a.posts.create({ projectId, ...draft });
        assert.deepEqual(sent, [`POST /api/v1/projects/${projectId}/posts`]);
        assert.equal(post.status, "draft");
        assert.equal(post.source, "Manual");
        assert.deepEqual(post.assets, []);
        textPost = post.id;
      });

      await t.test(
        "inline images are stored and served privately",
        async () => {
          const post = await a.posts.create({
            projectId,
            ...draft,
            platforms: ["instagram"],
            assets: [{ type: "INLINE_BASE64", dataBase64: image }],
          });
          assert.equal(post.assets.length, 1);
          assert.equal(post.assets[0].kind, "IMAGE");
          assert.match(
            post.assets[0].url,
            new RegExp(`^/api/posts/${post.id}/`),
          );
          // DTOs carry no storage details or undeclared columns.
          for (const key of ["imageKey", "imageBucket", "updatedAt"])
            assert.ok(!(key in post), `${key} must not be exposed`);
          imagePost = post.id;
        },
      );

      await t.test("invalid drafts are rejected with a reason", async () => {
        const needsMedia = await rejectsWith(
          a.posts.create({ projectId, ...draft, platforms: ["instagram"] }),
          "BAD_REQUEST",
        );
        assert.match(needsMedia.message, /validation/i);
        // Storage's own check, translated into a user-facing error.
        const notAnImage = await rejectsWith(
          a.posts.create({
            projectId,
            ...draft,
            assets: [
              {
                type: "INLINE_BASE64",
                dataBase64: Buffer.from("not an image").toString("base64"),
              },
            ],
          }),
          "BAD_REQUEST",
        );
        assert.match(notAnImage.message, /valid JPEG, PNG, or WebP/);
      });

      await t.test("only the project owner sees its posts", async () => {
        sent.length = 0;
        const listed = await a.posts.list({ projectId });
        assert.deepEqual(sent, [`GET /api/v1/projects/${projectId}/posts`]);
        assert.deepEqual(
          listed.map((p) => p.id).sort(),
          [imagePost, textPost].sort(),
        );
        await rejectsWith(b.posts.list({ projectId }), "NOT_FOUND");
        await rejectsWith(
          b.posts.update({ projectId, id: textPost, ...draft }),
          "NOT_FOUND",
        );
        await rejectsWith(
          b.posts.delete({ projectId, id: textPost }),
          "NOT_FOUND",
        );
      });

      await t.test("update keeps or replaces media as asked", async () => {
        sent.length = 0;
        const kept = await a.posts.update({
          projectId,
          id: imagePost,
          ...draft,
          title: "Kept image",
          platforms: ["instagram"],
        });
        assert.deepEqual(sent, [
          `PUT /api/v1/projects/${projectId}/posts/${imagePost}`,
        ]);
        assert.equal(kept.title, "Kept image");
        assert.equal(kept.assets.length, 1, "omitted assets keep the media");
        const instagramWithout = await rejectsWith(
          a.posts.update({
            projectId,
            id: imagePost,
            ...draft,
            platforms: ["instagram"],
            assets: [],
          }),
          "BAD_REQUEST",
        );
        assert.match(instagramWithout.message, /Instagram requires/);
        const removed = await a.posts.update({
          projectId,
          id: imagePost,
          ...draft,
          assets: [],
        });
        assert.deepEqual(removed.assets, [], "an empty list removes media");
      });

      await t.test("posts being published can't change", async () => {
        await getDb()
          .update(posts)
          .set({ status: "publishing" })
          .where(eq(posts.id, textPost));
        const locked = await rejectsWith(
          a.posts.update({ projectId, id: textPost, ...draft }),
          "CONFLICT",
        );
        assert.match(locked.message, /no longer editable/);
        await rejectsWith(
          a.posts.delete({ projectId, id: textPost }),
          "CONFLICT",
        );
        await getDb()
          .update(posts)
          .set({ status: "draft" })
          .where(eq(posts.id, textPost));
      });

      await t.test("delete removes the post", async () => {
        sent.length = 0;
        await a.posts.delete({ projectId, id: textPost });
        assert.deepEqual(sent, [
          `DELETE /api/v1/projects/${projectId}/posts/${textPost}`,
        ]);
        assert.ok(
          !(await a.posts.list({ projectId })).some((p) => p.id === textPost),
        );
        await rejectsWith(
          a.posts.delete({ projectId, id: textPost }),
          "NOT_FOUND",
        );
      });
    } finally {
      try {
        await users.cleanup();
      } finally {
        await closeDb();
      }
    }
  },
);
