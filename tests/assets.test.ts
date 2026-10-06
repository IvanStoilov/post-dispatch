import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  users,
  projects,
  posts,
  imageUploads,
  postAssets,
  directUploads,
} from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { createProject, updateProject } from "../src/lib/projects";
import {
  createPost,
  editPost,
  deletePost,
  getPostImage,
  storedAssets,
  listPosts,
} from "../src/lib/store";
import {
  createDirectUpload,
  completeDirectUpload,
  directUploadSchema,
} from "../src/lib/direct-uploads";
import {
  removeImage,
  readImage,
  isMp4,
  publicationImageUrl,
} from "../src/lib/storage";
import { mcpDraftSchema, filesDraftSchema } from "../src/lib/mcp-images";
import { validateAssetKinds } from "../src/lib/asset-inputs";
import { handleProjectMcp } from "../src/lib/mcp";
import { publishPost } from "../src/lib/meta";
import { GET as previewAsset } from "../src/app/api/posts/[id]/assets/[assetId]/route";
import {
  POST as prepareUpload,
  PATCH as finalizeUpload,
} from "../src/app/api/assets/uploads/route";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const origin = process.env.APP_URL || "http://localhost:8200";
const draft = {
  title: "Media test",
  caption: "Media test",
  platforms: ["facebook", "instagram"],
};
test("asset schemas support ordered sources and enforce media limits", async () => {
  const image = {
    type: "EXTERNAL_URL",
    kind: "IMAGE",
    url: "https://example.com/a.jpg",
  };
  assert.ok(
    mcpDraftSchema.safeParse({ ...draft, assets: [image, image] }).success,
  );
  assert.ok(
    mcpDraftSchema.safeParse({
      ...draft,
      assets: [{ ...image, kind: "VIDEO" }],
    }).success,
  );
  for (const assets of [
    Array(11).fill(image),
    [image, { ...image, kind: "VIDEO" }],
  ])
    assert.equal(mcpDraftSchema.safeParse({ ...draft, assets }).success, false);
  assert.equal(
    mcpDraftSchema.safeParse({
      ...draft,
      image: { type: "EXTERNAL_URL", url: image.url },
      assets: [image],
    }).success,
    false,
  );
  assert.equal(
    mcpDraftSchema.safeParse({
      ...draft,
      assets: [{ type: "INLINE_BASE64", kind: "VIDEO", dataBase64: "YQ==" }],
    }).success,
    false,
  );
  assert.ok(
    filesDraftSchema.safeParse({
      ...draft,
      assets: [
        { download_url: image.url, file_id: "file_1" },
        { download_url: image.url, file_id: "file_2" },
      ],
    }).success,
  );
  assert.throws(
    () => validateAssetKinds([{ kind: "IMAGE" }, { kind: "VIDEO" }]),
    /single video/,
  );
  assert.equal(
    directUploadSchema.safeParse({ mimeType: "video/mp4", fileSize: 100000001 })
      .success,
    false,
  );
  assert.equal(
    directUploadSchema.safeParse({ mimeType: "image/jpeg", fileSize: 4500001 })
      .success,
    false,
  );
  assert.ok(isMp4(await readFile("tests/fixtures/flower.mp4")));
  assert.equal(isMp4(Buffer.from("not an MP4")), false);
});
test(
  "multiple assets, private video uploads, editing and publishing",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const ids: string[] = [];
    const realFetch = globalThis.fetch;
    const email = `media-${randomUUID()}@example.test`;
    const password = `Test-only-${randomUUID()}`;
    const signup = await getAuth().handler(
      new Request(origin + "/api/auth/sign-up/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin },
        body: JSON.stringify({ name: "Media test", email, password }),
      }),
    );
    assert.equal(signup.status, 200);
    const identity = await signup.json();
    const userId = identity.user.id as string;
    const cookie = signup.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const first = await createProject(userId, { name: "Media test" });
    const second = await createProject(userId, { name: "Isolation test" });
    const projectId = first.project.id;
    async function insert(input: unknown) {
      const post = await createPost(projectId, input);
      ids.push(post.id);
      return post;
    }
    const padding = Buffer.alloc(5_000_000);
    padding.writeUInt32BE(padding.length);
    padding.write("free", 4, "ascii");
    const video = Buffer.concat([
      await readFile("tests/fixtures/flower.mp4"),
      padding,
    ]);
    const jpeg = await sharp({
      create: { width: 320, height: 320, channels: 3, background: "#88bb99" },
    })
      .jpeg()
      .toBuffer();
    const inline = {
      type: "INLINE_BASE64",
      dataBase64: jpeg.toString("base64"),
    };
    function api(
      path: string,
      body?: unknown,
      method = "GET",
      authenticated = true,
    ) {
      return new Request(origin + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          origin,
          cookie: authenticated ? cookie : "",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    }
    async function mcp(name: string, args: unknown) {
      const response = await handleProjectMcp(
        new Request(origin + `/api/mcp/${projectId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json, text/event-stream",
            authorization: `Bearer ${first.mcpToken}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
        projectId,
      );
      const result = await response.json();
      assert.ok(
        !result.error && !result.result.isError,
        JSON.stringify(result),
      );
      return JSON.parse(result.result.content[0].text);
    }
    let album: Awaited<ReturnType<typeof insert>>;
    let videoPost: Awaited<ReturnType<typeof insert>>;
    try {
      await t.test(
        "MCP creates ordered images and owner previews support every asset",
        async () => {
          album = await mcp("create_draft", {
            ...draft,
            assets: [inline, inline, inline],
          });
          ids.push(album.id);
          assert.equal(album.assets.length, 3);
          assert.ok(!JSON.stringify(album).includes("imageKey"));
          for (const asset of album.assets) {
            const ctx = {
              params: Promise.resolve({ id: album.id, assetId: asset.id }),
            };
            assert.equal(
              (await previewAsset(api(asset.url, undefined, "GET", false), ctx))
                .status,
              401,
            );
            const preview = await previewAsset(api(asset.url), ctx);
            assert.equal(preview.status, 307);
            assert.equal(
              preview.headers.get("Cache-Control"),
              "private, no-store",
            );
            assert.equal(
              (await realFetch(preview.headers.get("Location")!)).status,
              200,
            );
            assert.equal(
              (
                await previewAsset(
                  api(
                    `/api/posts/${album.id}/assets/${asset.id}?projectId=${second.project.id}`,
                  ),
                  ctx,
                )
              ).status,
              404,
            );
          }
        },
      );
      await t.test(
        "relational media enforces foreign keys, unique positions and image/video rules",
        async () => {
          const rows = await getDb()
            .select()
            .from(postAssets)
            .where(eq(postAssets.postId, album.id))
            .orderBy(postAssets.position);
          assert.deepEqual(
            rows.map((row) => row.id),
            album.assets.map((asset) => asset.id),
          );
          assert.deepEqual(
            rows.map((row) => row.position),
            [0, 1, 2],
          );
          await assert.rejects(() =>
            getDb().insert(postAssets).values({
              postId: randomUUID(),
              position: 0,
              kind: "IMAGE",
              imageKey: randomUUID(),
              imageBucket: "test",
              mimeType: "image/jpeg",
            }),
          );
          await assert.rejects(() =>
            getDb()
              .update(postAssets)
              .set({ position: 1 })
              .where(eq(postAssets.id, rows[0].id)),
          );
          await assert.rejects(() =>
            getDb()
              .update(postAssets)
              .set({ kind: "VIDEO", mimeType: "video/mp4" })
              .where(eq(postAssets.id, rows[0].id)),
          );
          await assert.rejects(() =>
            getDb()
              .update(postAssets)
              .set({ kind: "VIDEO" })
              .where(eq(postAssets.id, rows[0].id)),
          );
          assert.deepEqual(
            await getDb()
              .select()
              .from(postAssets)
              .where(eq(postAssets.postId, album.id))
              .orderBy(postAssets.position),
            rows,
          );
        },
      );
      await t.test(
        "editor reorders, removes, and appends assets without losing originals",
        async () => {
          const original = storedAssets(
            await getPostImage(projectId, album.id),
          );
          const originalRows = await getDb()
            .select()
            .from(postAssets)
            .where(eq(postAssets.postId, album.id));
          const revised = await editPost(projectId, album.id, {
            ...draft,
            assets: [
              { type: "EXISTING", assetId: original[2].id },
              { type: "EXISTING", assetId: original[0].id },
              inline,
            ],
          });
          assert.deepEqual(
            revised.assets.slice(0, 2).map((asset) => asset.id),
            [original[2].id, original[0].id],
          );
          const retainedRows = await getDb()
            .select()
            .from(postAssets)
            .where(eq(postAssets.postId, album.id));
          for (const asset of originalRows.filter(
            (row) => row.id !== original[1].id,
          ))
            assert.equal(
              retainedRows.find((row) => row.id === asset.id)?.createdAt,
              asset.createdAt,
            );
          await assert.rejects(() => readImage(original[1]));
          const before = storedAssets(await getPostImage(projectId, album.id));
          await assert.rejects(() =>
            editPost(second.project.id, album.id, {
              ...draft,
              assets: [{ type: "EXISTING", assetId: before[0].id }],
            }),
          );
          await assert.rejects(
            () =>
              editPost(projectId, album.id, {
                ...draft,
                assets: [
                  { type: "EXISTING", assetId: before[0].id },
                  { type: "EXISTING", assetId: before[0].id },
                ],
              }),
            /only once/,
          );
          assert.deepEqual(
            storedAssets(await getPostImage(projectId, album.id)),
            before,
          );
        },
      );
      await t.test(
        "large-file flow binds project, verifies bytes, and isolates finalized objects",
        async () => {
          assert.equal(
            (
              await prepareUpload(
                api(
                  `/api/assets/uploads?projectId=${projectId}`,
                  { mimeType: "video/mp4", fileSize: video.length },
                  "POST",
                  false,
                ),
              )
            ).status,
            401,
          );
          const start = await mcp("create_asset_upload", {
            mimeType: "video/mp4",
            fileSize: video.length,
          });
          const preflight = await realFetch(start.uploadUrl, {
            method: "OPTIONS",
            headers: {
              Origin: origin,
              "Access-Control-Request-Method": "PUT",
              "Access-Control-Request-Headers": "content-type",
            },
          });
          assert.equal(preflight.status, 200);
          assert.ok(
            [origin, "*"].includes(
              preflight.headers.get("Access-Control-Allow-Origin") || "",
            ),
          );
          assert.ok(
            (
              await realFetch(start.uploadUrl, {
                method: "PUT",
                headers: start.headers,
                body: video,
              })
            ).ok,
          );
          await assert.rejects(
            () =>
              completeDirectUpload(
                second.project.id,
                start.uploadId,
                start.completionToken,
              ),
            /not found/,
          );
          await assert.rejects(
            () => completeDirectUpload(projectId, start.uploadId, "wrong"),
            /Invalid.*token/,
          );
          const ready = await mcp("complete_asset_upload", {
            uploadId: start.uploadId,
            completionToken: start.completionToken,
          });
          assert.equal(ready.kind, "VIDEO");
          await assert.rejects(
            () =>
              completeDirectUpload(
                projectId,
                start.uploadId,
                start.completionToken,
              ),
            /already completed/,
          );
          await assert.rejects(
            () =>
              createPost(second.project.id, {
                ...draft,
                assets: [{ type: "UPLOAD_ID", uploadId: ready.assetUploadId }],
              }),
            /not found/,
          );
          await assert.rejects(
            () =>
              insert({
                ...draft,
                assets: [
                  { type: "UPLOAD_ID", uploadId: ready.assetUploadId },
                  inline,
                ],
              }),
            /single video/,
          );
          videoPost = await insert({
            ...draft,
            assets: [{ type: "UPLOAD_ID", uploadId: ready.assetUploadId }],
          });
          assert.equal(videoPost.assets[0].kind, "VIDEO");
          assert.equal(videoPost.imageUrl, "");
          await assert.rejects(
            () =>
              insert({
                ...draft,
                assets: [{ type: "UPLOAD_ID", uploadId: ready.assetUploadId }],
              }),
            /already used/,
          );
          // A still-valid PUT URL can only change its abandoned staging key.
          assert.ok(
            (
              await realFetch(start.uploadUrl, {
                method: "PUT",
                headers: start.headers,
                body: Buffer.alloc(video.length),
              })
            ).ok,
          );
          const [asset] = storedAssets(
            await getPostImage(projectId, videoPost.id),
          );
          assert.ok(Buffer.from(await readImage(asset)).equals(video));
          const pending = await createDirectUpload(projectId, {
            mimeType: "video/mp4",
            fileSize: video.length,
          });
          assert.ok(
            (
              await realFetch(pending.uploadUrl, {
                method: "PUT",
                headers: pending.headers,
                body: Buffer.alloc(video.length),
              })
            ).ok,
          );
          await assert.rejects(
            () =>
              completeDirectUpload(
                projectId,
                pending.uploadId,
                pending.completionToken,
              ),
            /valid video/,
          );
          // Browser route can finalize an image without exposing the S3 secret.
          const response = await prepareUpload(
            api(
              `/api/assets/uploads?projectId=${projectId}`,
              { mimeType: "image/jpeg", fileSize: jpeg.length },
              "POST",
            ),
          );
          assert.equal(response.status, 201);
          const imageStart = await response.json();
          assert.ok(
            (
              await realFetch(imageStart.uploadUrl, {
                method: "PUT",
                headers: imageStart.headers,
                body: jpeg,
              })
            ).ok,
          );
          const done = await finalizeUpload(
            api(
              `/api/assets/uploads?projectId=${projectId}`,
              { uploadId: imageStart.uploadId },
              "PATCH",
            ),
          );
          assert.equal(done.status, 200);
        },
      );
      await t.test(
        "ChatGPT file arrays import multiple images or one video privately",
        async () => {
          const tools = await handleProjectMcp(
            new Request(origin + `/api/mcp/${projectId}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                accept: "application/json, text/event-stream",
                authorization: `Bearer ${first.mcpToken}`,
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
                params: {},
              }),
            }),
            projectId,
          );
          const definition = (await tools.json()).result.tools.find(
            (tool: { name: string }) => tool.name === "create_draft_from_files",
          );
          assert.deepEqual(definition._meta["openai/fileParams"], ["assets"]);
          assert.equal(definition.inputSchema.properties.assets.type, "array");
          assert.deepEqual(
            definition.inputSchema.properties.assets.items.required.sort(),
            ["download_url", "file_id"],
          );
          const original = storedAssets(
            await getPostImage(projectId, album.id),
          );
          const files = [];
          for (const [index, asset] of original.slice(0, 2).entries())
            files.push({
              download_url: await publicationImageUrl(asset),
              file_id: `file_image_${index}`,
            });
          const imported = await mcp("create_draft_from_files", {
            ...draft,
            assets: files,
          });
          ids.push(imported.id);
          assert.equal(imported.assets.length, 2);
          const clip = storedAssets(
            await getPostImage(projectId, videoPost.id),
          )[0];
          const videoImport = await mcp("create_draft_from_files", {
            ...draft,
            assets: [
              {
                download_url: await publicationImageUrl(clip),
                file_id: "file_video",
                mime_type: "video/mp4",
                file_name: "flower.mp4",
              },
            ],
          });
          ids.push(videoImport.id);
          assert.equal(videoImport.assets[0].kind, "VIDEO");
          assert.ok(!JSON.stringify(videoImport).includes("file_video"));
          assert.notEqual(
            storedAssets(await getPostImage(projectId, videoImport.id))[0]
              .imageKey,
            clip.imageKey,
          );
        },
      );
      await updateProject(userId, projectId, {
        name: "Media test",
        facebookPageId: "fake-page",
        facebookPageToken: "fake-token",
        instagramAccountId: "fake-ig",
        instagramAccessToken: "fake-token",
        instagramApiHost: "graph.instagram.com",
      });
      const calls: {
        url: string;
        method: string;
        body: Record<string, string>;
      }[] = [];
      globalThis.fetch = async (url, options) => {
        calls.push({
          url: String(url),
          method: options?.method || "GET",
          body: options?.body
            ? Object.fromEntries(options.body as URLSearchParams)
            : {},
        });
        return options?.method === "POST"
          ? Response.json({ id: `remote-${calls.length}` })
          : Response.json({ status_code: "FINISHED" });
      };
      await t.test(
        "publishes an ordered Facebook multi-photo post and Instagram carousel",
        async () => {
          const result = await publishPost(projectId, album.id);
          assert.equal(result.status, "published");
          const facebook = calls.filter((call) =>
            call.url.includes("graph.facebook.com"),
          );
          assert.equal(facebook.length, 4);
          for (const photo of facebook.slice(0, 3)) {
            assert.match(photo.url, /\/photos$/);
            assert.equal(photo.body.published, "false");
          }
          assert.match(facebook[3].url, /\/feed$/);
          assert.equal(
            facebook[3].body["attached_media[0]"],
            JSON.stringify({ media_fbid: "remote-1" }),
          );
          const instagram = calls.filter((call) =>
            call.url.includes("graph.instagram.com"),
          );
          assert.equal(
            instagram
              .slice(0, 3)
              .every(
                (call) =>
                  call.body.is_carousel_item === "true" && !call.body.caption,
              ),
            true,
          );
          assert.equal(instagram[3].body.media_type, "CAROUSEL");
          assert.equal(
            instagram[3].body.children,
            "remote-5,remote-6,remote-7",
          );
          assert.equal(instagram[4].method, "GET");
          assert.equal(instagram[5].body.creation_id, "remote-8");
        },
      );
      await t.test(
        "publishes video to Facebook and waits for an Instagram Reel container",
        async () => {
          calls.length = 0;
          assert.equal(
            (await publishPost(projectId, videoPost.id)).status,
            "published",
          );
          assert.match(calls[0].url, /graph-video.facebook.com.*\/videos$/);
          assert.match(calls[0].body.file_url, /X-Amz-Signature=/);
          assert.equal(calls[1].body.media_type, "REELS");
          assert.equal(calls[1].body.video_url, calls[0].body.file_url);
          assert.equal(calls[2].method, "GET");
          assert.equal(calls[3].body.creation_id, "remote-2");
          await assert.rejects(
            () => publishPost(projectId, videoPost.id),
            /already been submitted/,
          );
        },
      );
      await t.test(
        "container rejection retains Facebook delivery and blocks automatic retry",
        async () => {
          globalThis.fetch = realFetch;
          const start = await createDirectUpload(projectId, {
            mimeType: "video/mp4",
            fileSize: video.length,
          });
          await realFetch(start.uploadUrl, {
            method: "PUT",
            headers: start.headers,
            body: video,
          });
          const ready = await completeDirectUpload(projectId, start.uploadId);
          const rejected = await insert({
            ...draft,
            assets: [{ type: "UPLOAD_ID", uploadId: ready.assetUploadId }],
          });
          globalThis.fetch = async (_url, options) =>
            options?.method === "POST"
              ? Response.json({ id: "remote" })
              : Response.json({
                  status_code: "ERROR",
                  status: "Unsupported codec",
                });
          await assert.rejects(
            () => publishPost(projectId, rejected.id),
            /Unsupported codec/,
          );
          const row = (await listPosts(projectId)).find(
            (item) => item.id === rejected.id,
          )!;
          assert.equal(row.status, "needs_review");
          assert.equal(row.results.facebook, "remote");
          assert.equal(row.results.instagram, undefined);
        },
      );
      await t.test("deletion removes every private object", async () => {
        const media = storedAssets(await getPostImage(projectId, album.id));
        await deletePost(projectId, album.id);
        assert.equal(
          (
            await getDb()
              .select()
              .from(postAssets)
              .where(eq(postAssets.postId, album.id))
          ).length,
          0,
        );
        for (const asset of media) await assert.rejects(() => readImage(asset));
      });
    } finally {
      globalThis.fetch = realFetch;
      const owned = await getDb()
        .select()
        .from(projects)
        .where(eq(projects.userId, userId));
      const projectIds = owned.map((item) => item.id);
      for (const row of await getDb()
        .select()
        .from(posts)
        .where(inArray(posts.projectId, projectIds)))
        for (const asset of storedAssets(
          await getPostImage(row.projectId, row.id),
        ))
          await removeImage(asset);
      for (const row of await getDb()
        .select()
        .from(imageUploads)
        .where(inArray(imageUploads.projectId, projectIds)))
        await removeImage(row);
      for (const row of await getDb()
        .select()
        .from(directUploads)
        .where(inArray(directUploads.projectId, projectIds)))
        await removeImage(row);
      await getDb().delete(posts).where(inArray(posts.projectId, projectIds));
      await getDb()
        .delete(imageUploads)
        .where(inArray(imageUploads.projectId, projectIds));
      await getDb()
        .delete(directUploads)
        .where(inArray(directUploads.projectId, projectIds));
      await getDb().delete(projects).where(inArray(projects.id, projectIds));
      await getDb().delete(users).where(eq(users.id, userId));
      await closeDb();
    }
  },
);
