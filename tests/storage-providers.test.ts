import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import { localProvider } from "../src/lib/storage/providers/local";
import { s3Provider } from "../src/lib/storage/providers/s3";
import { storageProvider } from "../src/lib/storage/index";
import { storeAsset, readImage, getAssetUrl } from "../src/lib/storage";
import { getDb, closeDb } from "../src/db";
import {
  users,
  projects,
  posts,
  postAssets,
  imageUploads,
  directUploads,
  accountMediaCleanup,
} from "../src/db/schema";
import { createProject } from "../src/lib/projects";
import { uploadsService } from "../src/domain/uploads";
import { createPost, deletePost } from "../src/lib/store";
import { projectsService } from "../src/domain/projects";
import { recoverMediaCleanup } from "../src/lib/media-cleanup";
import { PUT as uploadLocal } from "../src/app/api/mcp/uploads/local/route";
import {
  GET as readLocal,
  HEAD as headLocal,
} from "../src/app/api/mcp/media/local/route";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test("local file I/O is private, bounded, idempotent and rejects path/symlink escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "ramblo-local-")),
    outside = await mkdtemp(join(tmpdir(), "ramblo-outside-"));
  try {
    const provider = localProvider(root),
      file = { bucket: "media", key: "project/file.txt" },
      bytes = Buffer.from("private contents");
    await provider.write(file, bytes, "text/plain");
    assert.deepEqual(await provider.read(file, 100), bytes);
    await assert.rejects(provider.read(file, 1), /size limit/);
    await provider.write(
      { ...file, key: "project/two.txt" },
      bytes,
      "text/plain",
    );
    assert.equal((await provider.list("media", "project/", 1)).truncated, true);
    for (const key of [
      "../escape",
      "/absolute",
      "project/../../escape",
      "project\\escape",
    ])
      await assert.rejects(
        provider.write({ bucket: "media", key }, bytes, "text/plain"),
      );
    await assert.rejects(
      provider.write(
        { bucket: "../outside", key: "file" },
        bytes,
        "text/plain",
      ),
    );
    await symlink(outside, join(root, "media", "escape"));
    await assert.rejects(
      provider.write(
        { bucket: "media", key: "escape/nested/file" },
        bytes,
        "text/plain",
      ),
      /symlink/,
    );
    await assert.rejects(readFile(join(outside, "nested", "file")));
    await provider.delete("media", ["project/file.txt", "project/two.txt"]);
    await provider.delete("media", ["project/file.txt"]);
    assert.equal((await provider.list("media", "project/", 10)).keys.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("S3 provider performs only object I/O using the referenced bucket and key", async () => {
  const env = { ...process.env };
  Object.assign(process.env, {
    AWS_ENDPOINT_URL_S3: "https://storage.example.test",
    AWS_REGION: "test",
    AWS_ACCESS_KEY_ID: "test-access",
    AWS_SECRET_ACCESS_KEY: "test-secret",
  });
  const bytes = Buffer.from("object");
  const calls: unknown[] = [];
  const send = mock.method(
    S3Client.prototype,
    "send",
    async (command: unknown) => {
      calls.push(command);
      if (command instanceof GetObjectCommand)
        return {
          ContentLength: bytes.length,
          Body: {
            transformToWebStream: () =>
              new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes);
                  controller.close();
                },
              }),
          },
        };
      if (command instanceof ListObjectsV2Command)
        return { Contents: [{ Key: "project/file" }], IsTruncated: false };
      return {};
    },
  );
  try {
    await s3Provider.write(
      { bucket: "original-bucket", key: "project/file" },
      bytes,
      "image/jpeg",
    );
    assert.deepEqual(
      await s3Provider.read(
        { bucket: "original-bucket", key: "project/file" },
        100,
      ),
      bytes,
    );
    await s3Provider.delete("original-bucket", ["project/file"]);
    await s3Provider.delete("original-bucket", ["project/a", "project/b"]);
    assert.deepEqual(
      await s3Provider.list("original-bucket", "project/", 200),
      { keys: ["project/file"], truncated: false },
    );
    assert.ok(
      calls.every(
        (c) => (c as PutObjectCommand).input.Bucket === "original-bucket",
      ),
    );
    assert.ok(calls.some((c) => c instanceof DeleteObjectCommand));
    assert.ok(calls.some((c) => c instanceof DeleteObjectsCommand));
  } finally {
    send.mock.restore();
    process.env = env;
  }
});

test("local storage endpoints are unavailable in production", async () => {
  const env = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "development" });
  process.env.VERCEL = "0";
  try {
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.throws(() => storageProvider("local"), /development/);
    assert.equal(
      (await readLocal(new Request("http://localhost/api/mcp/media/local")))
        .status,
      404,
    );
    assert.equal(
      (
        await uploadLocal(
          new Request("http://localhost/api/mcp/uploads/local", {
            method: "PUT",
          }),
        )
      ).status,
      404,
    );
    Object.assign(process.env, { NODE_ENV: "development" });
    process.env.VERCEL = "1";
    assert.throws(() => storageProvider("local"), /development/);
  } finally {
    process.env = env;
  }
});

test(
  "local upload, persisted provider, media links, video ranges and durable cleanup work without S3",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const env = { ...process.env },
      root = await mkdtemp(join(tmpdir(), "ramblo-storage-flow-")),
      userId = randomUUID();
    const ids: string[] = [];
    Object.assign(process.env, {
      NODE_ENV: "development",
      VERCEL: "0",
      STORAGE_PROVIDER: "local",
      LOCAL_STORAGE_PATH: root,
    });
    for (const key of [
      "AWS_ENDPOINT_URL_S3",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_REGION",
      "AWS_S3_BUCKET",
    ])
      delete process.env[key];
    const network = mock.method(S3Client.prototype, "send", async () => {
      throw new Error("S3 must not be used for local files");
    });
    try {
      await getDb()
        .insert(users)
        .values({
          id: userId,
          name: "Local storage test",
          email: `local-${userId}@example.test`,
        });
      const project = (await createProject(userId, { name: "Local media" }))
        .project;
      ids.push(project.id);
      const image = await sharp({
        create: { width: 3, height: 2, channels: 3, background: "#ffc531" },
      })
        .png()
        .toBuffer();
      const pending = await uploadsService.start(
        { userId },
        {
          projectId: project.id,
          mimeType: "image/png",
          fileSize: image.length,
        },
      );
      assert.equal(
        new URL(pending.uploadUrl).searchParams.get("uploadId"),
        pending.uploadId,
      );
      assert.ok(!new URL(pending.uploadUrl).searchParams.has("token"));
      await t.test(
        "local uploads enforce content type and exact size",
        async () => {
          assert.equal(
            (
              await uploadLocal(
                new Request(pending.uploadUrl, {
                  method: "PUT",
                  headers: { "content-type": "video/mp4" },
                  body: image,
                }),
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await uploadLocal(
                new Request(pending.uploadUrl, {
                  method: "PUT",
                  headers: { "content-type": "image/png" },
                  body: image.subarray(0, 1),
                }),
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await uploadLocal(
                new Request(pending.uploadUrl, {
                  method: "PUT",
                  headers: { "content-type": "image/png" },
                  body: Buffer.concat([image, Buffer.from("x")]),
                }),
              )
            ).status,
            413,
          );
          assert.equal(
            (
              await uploadLocal(
                new Request(pending.uploadUrl, {
                  method: "PUT",
                  headers: { "content-type": "image/png" },
                  body: image,
                }),
              )
            ).status,
            204,
          );
        },
      );
      process.env.STORAGE_PROVIDER = "s3"; // A changed default cannot move an existing staged file.
      const ready = await uploadsService.completeWithToken({
        projectId: project.id,
        uploadId: pending.uploadId,
        completionToken: pending.completionToken,
      });
      const [registered] = await getDb()
        .select()
        .from(imageUploads)
        .where(eq(imageUploads.id, ready.assetUploadId));
      assert.equal(registered.storageProvider, "local");
      const post = await createPost(project.id, {
        title: "Local photo",
        caption: "Private local photo",
        platforms: ["facebook"],
        assets: [{ type: "UPLOAD_ID", uploadId: ready.assetUploadId }],
      });
      const [asset] = await getDb()
        .select()
        .from(postAssets)
        .where(eq(postAssets.postId, post.id));
      assert.equal(asset.storageProvider, "local");
      assert.equal((await readImage(asset))[0], 0xff);
      const url = await getAssetUrl(asset);
      assert.equal((await readLocal(new Request(url))).status, 200);
      assert.equal(
        (await headLocal(new Request(url, { method: "HEAD" }))).headers.get(
          "content-type",
        ),
        "image/jpeg",
      );
      assert.ok(!new URL(url).searchParams.has("token"));
      assert.equal(
        (
          await uploadLocal(
            new Request(pending.uploadUrl, {
              method: "PUT",
              headers: { "content-type": "image/png" },
              body: image,
            }),
          )
        ).status,
        404,
      );
      assert.ok(!JSON.stringify(post).includes("storageProvider"));
      process.env.STORAGE_PROVIDER = "local";
      const video = await readFile(
        new URL("./fixtures/flower.mp4", import.meta.url),
      );
      const movie = await storeAsset(project.id, video, "VIDEO");
      const videoPost = await createPost(project.id, {
        title: "Video",
        caption: "Local video",
        platforms: ["facebook"],
      });
      await getDb()
        .insert(postAssets)
        .values({ ...movie, postId: videoPost.id, position: 0 });
      const videoUrl = await getAssetUrl(movie);
      const range = await readLocal(
        new Request(videoUrl, { headers: { range: "bytes=0-7" } }),
      );
      assert.equal(range.status, 206);
      assert.deepEqual(
        Buffer.from(await range.arrayBuffer()),
        video.subarray(0, 8),
      );
      assert.equal(
        (
          await readLocal(
            new Request(videoUrl, { headers: { range: "bytes=999999999-" } }),
          )
        ).status,
        416,
      );
      process.env.STORAGE_PROVIDER = "s3";
      await deletePost(project.id, post.id);
      assert.equal((await readLocal(new Request(url))).status, 404);
      process.env.STORAGE_PROVIDER = "local";
      await projectsService.delete(
        { userId },
        { id: project.id, confirmation: project.name },
      );
      const targets = await getDb()
        .select()
        .from(accountMediaCleanup)
        .where(eq(accountMediaCleanup.prefix, `${project.id}/`));
      assert.equal(targets.length, 1);
      assert.equal(targets[0].storageProvider, "local");
      await getDb()
        .update(accountMediaCleanup)
        .set({ nextAttemptAt: new Date(0), finalSweepAfter: new Date(0) })
        .where(eq(accountMediaCleanup.prefix, `${project.id}/`));
      await recoverMediaCleanup();
      assert.equal(
        (
          await getDb()
            .select()
            .from(accountMediaCleanup)
            .where(eq(accountMediaCleanup.prefix, `${project.id}/`))
        ).length,
        0,
      );
      await assert.rejects(readImage(movie));
      assert.equal(network.mock.callCount(), 0);
    } finally {
      network.mock.restore();
      if (ids.length) {
        await getDb()
          .delete(accountMediaCleanup)
          .where(
            inArray(
              accountMediaCleanup.prefix,
              ids.map((id) => `${id}/`),
            ),
          );
        await getDb()
          .delete(directUploads)
          .where(inArray(directUploads.projectId, ids));
        await getDb()
          .delete(imageUploads)
          .where(inArray(imageUploads.projectId, ids));
        await getDb().delete(posts).where(inArray(posts.projectId, ids));
        await getDb().delete(projects).where(inArray(projects.id, ids));
      }
      await getDb().delete(users).where(eq(users.id, userId));
      await rm(root, { recursive: true, force: true });
      process.env = env;
      await closeDb();
    }
  },
);
