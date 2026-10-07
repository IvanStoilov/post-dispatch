import { rotateAccountToken, verifyAccountToken } from "../src/lib/mcp-account";
import sharp from "sharp";
import { removeImage } from "../src/lib/storage";
import test from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  imageUploads,
  postAssets,
  posts,
  projects,
  uploadTokens,
  users,
} from "../src/db/schema";
import { createUploadToken, receiveImageUpload } from "../src/lib/uploads";
import {
  createPost as insertPost,
  listPosts,
  editPost,
  deletePost,
  claimPost,
  getPostImage,
  storedAssets,
} from "../src/lib/store";
import {
  createProject,
  updateProject,
  getProject,
  listProjects,
} from "../src/lib/projects";
import { publishPost } from "../src/lib/meta";
import type { Platform } from "../src/lib/types";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const createdIds: string[] = [];
const createdProjectIds: string[] = [];
let projectId = "";
const source = "Test " + randomUUID();
const userId = randomUUID();
async function createPost(input: unknown) {
  const p = await insertPost(projectId, {
    ...(input as Record<string, unknown>),
    source,
  });
  createdIds.push(p.id);
  return p;
}
const realFetch = globalThis.fetch;
const draft: {
  title: string;
  caption: string;
  platforms: Platform[];
  imageFile: { dataBase64: string };
} = {
  title: "Test post",
  caption: "Test caption",
  platforms: ["facebook", "instagram"],
  imageFile: { dataBase64: "" },
};
test(
  "Postgres storage and publishing",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    try {
      draft.imageFile.dataBase64 = (
        await sharp({
          create: {
            width: 320,
            height: 320,
            channels: 3,
            background: "#66aa88",
          },
        })
          .jpeg()
          .toBuffer()
      ).toString("base64");
      await getDb()
        .insert(users)
        .values({
          id: userId,
          name: "Publishing test",
          email: `${userId}@example.test`,
        });
      const first = await createProject(userId, { name: source });
      projectId = first.project.id;
      createdProjectIds.push(projectId);
      const second = await createProject(userId, { name: source + " B" });
      createdProjectIds.push(second.project.id);
      await t.test(
        "project credentials and tokens stay private and isolated",
        async () => {
          const firstToken = await rotateAccountToken(userId);
          assert.equal(
            await verifyAccountToken(`Bearer ${firstToken.mcpToken}`),
            userId,
          );
          const rotated = await rotateAccountToken(userId);
          assert.equal(
            await verifyAccountToken(`Bearer ${firstToken.mcpToken}`),
            null,
          );
          assert.equal(
            await verifyAccountToken(`Bearer ${rotated.mcpToken}`),
            userId,
          );
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          assert.ok(
            !(await listPosts(second.project.id)).some(
              (row) => row.id === p.id,
            ),
          );
          await assert.rejects(() => editPost(second.project.id, p.id, draft));
          await assert.rejects(() => deletePost(second.project.id, p.id));
          await assert.rejects(
            () => publishPost(second.project.id, p.id),
            /Post not found/,
          );
          const safe = (await listProjects(userId)).find(
            (row) => row.id === projectId,
          )!;
          assert.ok(!("facebookPageToken" in safe));
          assert.ok(!("instagramAccessToken" in safe));
          assert.ok(!("mcpTokenHash" in safe));
        },
      );
      await t.test(
        "validates, saves, edits, and reloads posts from a new pool",
        async () => {
          await assert.rejects(
            () => createPost({ ...draft, imageFile: undefined, imageUrl: "" }),
            /Instagram requires/,
          );
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          await editPost(projectId, p.id, {
            ...draft,
            title: "Updated database draft",
            platforms: ["facebook"],
          });
          await closeDb();
          const reloaded = (await listPosts(projectId)).find(
            (row) => row.id === p.id,
          )!;
          assert.equal(reloaded.title, "Updated database draft");
          assert.equal(reloaded.createdAt, p.createdAt);
          await deletePost(projectId, p.id);
          assert.ok(
            !(await listPosts(projectId)).some((row) => row.id === p.id),
          );
        },
      );
      await t.test(
        "missing channel configuration rolls back the publishing claim",
        async () => {
          const p = await createPost({ ...draft, platforms: ["facebook"] });
          await assert.rejects(
            () =>
              claimPost(projectId, p.id, { facebook: false, instagram: false }),
            /Connect facebook/,
          );
          assert.equal(
            (await listPosts(projectId)).find((row) => row.id === p.id)!.status,
            "draft",
          );
        },
      );
      await t.test("in-progress publishing blocks deletion", async () => {
        const p = await createPost({ ...draft, platforms: ["facebook"] });
        await claimPost(projectId, p.id, { facebook: true, instagram: true });
        await assert.rejects(
          () => deletePost(projectId, p.id),
          /currently publishing/,
        );
        assert.equal(
          (await listPosts(projectId)).find((row) => row.id === p.id)!.status,
          "publishing",
        );
      });
      await t.test("database enforces required Instagram media", async () => {
        const p = await createPost(draft);
        await assert.rejects(() =>
          getDb().transaction(async (tx) => {
            await tx.delete(postAssets).where(eq(postAssets.postId, p.id));
            await tx
              .update(posts)
              .set({ status: "publishing", imageUrl: "" })
              .where(eq(posts.id, p.id));
          }),
        );
      });
      await t.test("uploaded images attach to exactly one draft", async () => {
        const { uploadUrl, token } = await createUploadToken(projectId);
        const post = (
          authorization: string,
          body = draft.imageFile.dataBase64,
        ) =>
          new Request(uploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${authorization}` },
            body: Buffer.from(body, "base64"),
          });
        await assert.rejects(
          () => receiveImageUpload(projectId, post("wrong")),
          /invalid, expired, or used up/,
        );
        await assert.rejects(
          () => receiveImageUpload(second.project.id, post(token)),
          /invalid, expired, or used up/,
        );
        await assert.rejects(
          () =>
            receiveImageUpload(
              projectId,
              post(token, Buffer.from("not an image").toString("base64")),
            ),
          /valid JPEG/,
        );
        const [{ uploadsRemaining }] = await getDb()
          .select()
          .from(uploadTokens)
          .where(eq(uploadTokens.projectId, projectId));
        assert.equal(uploadsRemaining, 20);
        const uploads = await Promise.all([
          receiveImageUpload(projectId, post(token)),
          receiveImageUpload(projectId, post(token)),
        ]);
        assert.notEqual(uploads[0].imageUploadId, uploads[1].imageUploadId);
        const fromUpload = {
          ...draft,
          imageFile: undefined,
          imageUploadId: uploads[0].imageUploadId,
        };
        await assert.rejects(
          () => insertPost(second.project.id, { ...fromUpload, source }),
          /not found/,
        );
        const p = await createPost(fromUpload);
        assert.ok(p.imageUrl.startsWith(`/api/posts/${p.id}/image`));
        await assert.rejects(() => createPost(fromUpload), /already used/);
        await createPost({
          ...fromUpload,
          imageUploadId: uploads[1].imageUploadId,
        });
      });
      await t.test(
        "assistant drafts may omit the Instagram image until publishing",
        async () => {
          const p = await insertPost(
            projectId,
            { ...draft, imageFile: undefined, source },
            { allowMissingImage: true },
          );
          createdIds.push(p.id);
          assert.equal(p.imageUrl, "");
          await assert.rejects(
            () =>
              claimPost(projectId, p.id, { facebook: true, instagram: true }),
            /Add an image/,
          );
        },
      );
      await t.test("parallel inserts keep every post", async () => {
        const inserted = await Promise.all(
          Array.from({ length: 6 }, () =>
            createPost({ ...draft, platforms: ["facebook"] }),
          ),
        );
        const persisted = new Set(
          (await listPosts(projectId)).map((p) => p.id),
        );
        assert.ok(inserted.every((p) => persisted.has(p.id)));
      });
      await updateProject(userId, projectId, {
        name: source,
        facebookPageId: "page",
        facebookPageToken: "fake-token",
        instagramAccountId: "instagram",
        instagramAccessToken: "fake-token",
      });
      await updateProject(userId, projectId, { name: source });
      assert.equal(
        (await getProject(projectId)).facebookPageToken,
        "fake-token",
      );
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
          const result = await publishPost(projectId, p.id);
          assert.equal(result.status, "published");
          await assert.rejects(
            () => editPost(projectId, p.id, draft),
            /no longer editable/,
          );

          assert.deepEqual(result.results, {
            facebook: "id-1",
            instagram: "id-3",
          });
          assert.equal(calls[0].body.caption, "Test caption");
          assert.match(calls[1].body.image_url, /X-Amz-Signature=/);
          assert.equal(calls[0].body.url, calls[1].body.image_url);
          assert.equal(calls[2].body.creation_id, "id-2");
          await assert.rejects(
            () => publishPost(projectId, p.id),
            /already been submitted/,
          );
          assert.equal(calls.length, 3);
          await deletePost(projectId, p.id);
          assert.ok(
            !(await listPosts(projectId)).some((row) => row.id === p.id),
          );
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
          await assert.rejects(
            () => publishPost(projectId, p.id),
            /Permission denied/,
          );
          const saved = (await listPosts(projectId)).find(
            (post) => post.id === p.id,
          );
          assert.equal(saved!.status, "needs_review");
          assert.equal(saved!.results.facebook, "facebook-success");
          await assert.rejects(
            () => publishPost(projectId, p.id),
            /already been submitted/,
          );
          assert.equal(n, 2);
          await deletePost(projectId, p.id);
          assert.ok(
            !(await listPosts(projectId)).some((row) => row.id === p.id),
          );
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
            publishPost(projectId, p.id),
            publishPost(projectId, p.id),
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
          await assert.rejects(() => publishPost(projectId, p.id), /Timed out/);
          assert.equal(
            (await listPosts(projectId)).find((post) => post.id === p.id)!
              .status,
            "needs_review",
          );
        },
      );
    } finally {
      globalThis.fetch = realFetch;
      try {
        if (createdIds.length) {
          for (const row of await getDb()
            .select()
            .from(posts)
            .where(inArray(posts.id, createdIds)))
            for (const asset of storedAssets(
              await getPostImage(row.projectId, row.id),
            ))
              await removeImage(asset);
          await getDb().delete(posts).where(inArray(posts.id, createdIds));
        }
      } finally {
        try {
          if (createdProjectIds.length) {
            for (const upload of await getDb()
              .delete(imageUploads)
              .where(inArray(imageUploads.projectId, createdProjectIds))
              .returning())
              await removeImage(upload);
            await getDb()
              .delete(projects)
              .where(inArray(projects.id, createdProjectIds));
          }
        } finally {
          try {
            await getDb().delete(users).where(eq(users.id, userId));
          } finally {
            await closeDb();
          }
        }
      }
    }
  },
);
