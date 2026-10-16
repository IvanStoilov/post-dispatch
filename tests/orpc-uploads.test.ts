import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { inArray } from "drizzle-orm";
import { closeDb, getDb } from "../src/db";
import { directUploads, imageUploads } from "../src/db/schema";
import { POST as completeWithToken } from "../src/app/api/mcp/uploads/complete/route";
import { client, rejectsWith, testUsers } from "./helpers/orpc";
import { storageRequest } from "./helpers/storage";

test(
  "upload procedures require a session",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await rejectsWith(
      client().uploads.start({
        projectId: crypto.randomUUID(),
        mimeType: "image/jpeg",
        fileSize: 100,
      }),
      "UNAUTHORIZED",
    );
  },
);

test(
  "direct uploads belong to the project owner until one draft claims them",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const users = testUsers();
    const projectIds: string[] = [];
    try {
      const a = await users.signedIn(),
        b = await users.signedIn();
      const { id: projectId } = await a.projects.create({ name: "Uploads" });
      const { id: otherId } = await b.projects.create({ name: "Other" });
      projectIds.push(projectId, otherId);
      const jpeg = await sharp({
        create: { width: 64, height: 64, channels: 3, background: "#336699" },
      })
        .jpeg()
        .toBuffer();
      const file = { mimeType: "image/jpeg" as const, fileSize: jpeg.length };

      await t.test("other users can't start uploads in a project", async () => {
        await rejectsWith(b.uploads.start({ projectId, ...file }), "NOT_FOUND");
      });

      const start = await a.uploads.start({ projectId, ...file });
      assert.equal(
        (
          await storageRequest(start.uploadUrl, {
            method: "PUT",
            headers: start.headers,
            body: jpeg,
          })
        ).status,
        204,
      );
      const ref = { projectId, uploadId: start.uploadId };

      await t.test(
        "only the owner or the completion token completes",
        async () => {
          await rejectsWith(b.uploads.complete(ref), "NOT_FOUND");
          const response = await completeWithToken(
            new Request(start.completionUrl, {
              method: "POST",
              body: JSON.stringify({
                uploadId: start.uploadId,
                completionToken: "wrong",
              }),
            }),
          );
          assert.equal(response.status, 403);
        },
      );

      let assetUploadId = "";
      await t.test("completing stores the file once", async () => {
        const ready = await a.uploads.complete(ref);
        assert.equal(ready.kind, "IMAGE");
        assetUploadId = ready.assetUploadId;
        await rejectsWith(a.uploads.complete(ref), "NOT_FOUND");
      });

      await t.test(
        "the upload attaches to one draft in its project",
        async () => {
          const draft = {
            title: "Uploaded",
            caption: "From an upload",
            platforms: ["facebook" as const],
            assets: [{ type: "UPLOAD_ID" as const, uploadId: assetUploadId }],
          };
          await rejectsWith(
            b.posts.create({ projectId: otherId, ...draft }),
            "BAD_REQUEST",
          );
          const post = await a.posts.create({ projectId, ...draft });
          assert.equal(post.assets.length, 1);
          await rejectsWith(
            a.posts.create({ projectId, ...draft }),
            "BAD_REQUEST",
          );
        },
      );
    } finally {
      try {
        if (projectIds.length) {
          await getDb()
            .delete(directUploads)
            .where(inArray(directUploads.projectId, projectIds));
          await getDb()
            .delete(imageUploads)
            .where(inArray(imageUploads.projectId, projectIds));
        }
        await users.cleanup();
      } finally {
        await closeDb();
      }
    }
  },
);
