import { acceptedSignup } from "./helpers/terms";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import { getDb, closeDb } from "../src/db";
import {
  users,
  projects,
  posts,
  postAssets,
  imageUploads,
  directUploads,
  uploadTokens,
  publishJobs,
  projectConnectors,
  postPublications,
  verifications,
  accountMediaCleanup,
} from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { appOrigin } from "../src/lib/origins";
import { createProject } from "../src/lib/projects";
import { createPost } from "../src/lib/store";
import {
  rotateAccountToken,
  verifyAccountToken,
  resolveMcpProject,
} from "../src/lib/mcp-account";
import {
  startConnection,
  pendingConnectionBelongsTo,
} from "../src/lib/connector-connect";
import { processPublishingJob } from "../src/lib/publish-jobs";
import { DELETE } from "../src/app/api/projects/[id]/route";
loadEnvConfig(process.cwd());
process.env.STORAGE_PROVIDER = "s3";
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test(
  "project deletion is scoped, confirmed, publishing-safe and preserves the account",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const db = getDb(),
      env = { ...process.env },
      created: string[] = [],
      projectIds: string[] = [],
      verificationIds: string[] = [];
    Object.assign(process.env, {
      MAIL_PROVIDER: "console",
      AWS_S3_BUCKET: "project-deletion-test",
      FACEBOOK_APP_ID: "123456",
      FACEBOOK_APP_SECRET: "test-secret",
    });
    const storage = mock.method(
      S3Client.prototype,
      "send",
      async (command: unknown) => {
        if (command instanceof ListObjectsV2Command)
          return { Contents: [], IsTruncated: false };
        if (command instanceof DeleteObjectsCommand) return {};
        if (command instanceof ListBucketsCommand)
          return { Buckets: [{ Name: "project-deletion-test" }] };
        throw new Error("Unexpected storage call");
      },
    );
    const cookie = (r: Response) =>
      r.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
    const req = (
      path: string,
      body: unknown,
      cookies = "",
      method = "POST",
      origin = appOrigin(),
    ) =>
      new Request(appOrigin() + path, {
        method,
        headers: {
          cookie: cookies,
          origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          path.endsWith("/sign-up/email") ? acceptedSignup(body) : body,
        ),
      });
    async function fixture() {
      const email = `project-delete-${randomUUID()}@example.test`,
        password = `Password-${randomUUID()}`;
      const signup = await getAuth().handler(
        req("/api/auth/sign-up/email", {
          name: "Project deletion test",
          email,
          password,
        }),
      );
      assert.equal(signup.status, 200);
      const { user } = await signup.json();
      created.push(user.id);
      await db
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, user.id));
      const signin = await getAuth().handler(
        req("/api/auth/sign-in/email", { email, password }),
      );
      assert.equal(signin.status, 200);
      const [project] = await db.insert(projects).values({ userId: user.id, name: "Deletion fixture" }).returning();
      projectIds.push(project.id);
      return { id: user.id, cookie: cookie(signin), project };
    }
    try {
      const a = await fixture(),
        b = await fixture();
      const keep = (await createProject(a.id, { name: "Keep this project" }))
        .project;
      projectIds.push(keep.id);
      const token = await rotateAccountToken(a.id);
      const endpoint = `/api/projects/${a.project.id}`,
        ctx = { params: Promise.resolve({ id: a.project.id }) };
      const body = { confirmation: a.project.name };
      const remove = (
        input: unknown = body,
        cookies = a.cookie,
        origin = appOrigin(),
      ) => DELETE(req(endpoint, input, cookies, "DELETE", origin), ctx);
      await t.test(
        "requires session, exact confirmation and ownership; rejects cross-site requests",
        async () => {
          assert.equal((await remove(body, "")).status, 401);
          assert.equal((await remove(body, b.cookie)).status, 404);
          assert.equal(
            (await remove(body, a.cookie, "https://evil.example")).status,
            403,
          );
          assert.equal(
            (await remove({ confirmation: "wrong project" })).status,
            400,
          );
          assert.equal((await remove({ ...body, userId: b.id })).status, 400);
          assert.equal(
            (
              await db
                .select()
                .from(projects)
                .where(eq(projects.id, a.project.id))
            ).length,
            1,
          );
        },
      );
      const post = await createPost(a.project.id, {
        title: "Disposable draft",
        caption: "Delete this draft only",
        platforms: ["facebook"],
      });
      const keptPost = await createPost(keep.id, {
        title: "Keep me",
        caption: "Preserve this draft",
        platforms: ["facebook"],
      });
      await db.insert(postAssets).values({
        id: randomUUID(),
        postId: post.id,
        position: 0,
        kind: "IMAGE",
        mimeType: "image/jpeg",
        imageBucket: "project-deletion-test",
        imageKey: `${a.project.id}/image.jpg`,
      });
      await db.insert(imageUploads).values({
        projectId: a.project.id,
        imageBucket: "project-deletion-test",
        imageKey: `${a.project.id}/unused.jpg`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await db.insert(directUploads).values({
        projectId: a.project.id,
        imageBucket: "project-deletion-test",
        imageKey: `${a.project.id}/pending/file`,
        mimeType: "image/jpeg",
        fileSize: 100,
        completionTokenHash: "d".repeat(64),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await db.insert(uploadTokens).values({
        projectId: a.project.id,
        tokenHash: "e".repeat(64),
        uploadsRemaining: 1,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await db.insert(projectConnectors).values({
        projectId: a.project.id,
        provider: "facebook",
        accountId: "test-page",
        accessToken: "secret-token",
      });
      await db.insert(postPublications).values({
        projectId: a.project.id,
        postId: post.id,
        platform: "facebook",
        remotePostId: "published-copy",
        publishedAt: new Date(),
      });
      for (const projectId of [a.project.id, keep.id])
        assert.equal(
          (
            await startConnection(
              req("/api/meta/facebook/start", { projectId }, a.cookie),
              "facebook",
            )
          ).status,
          200,
        );
      const handshakes = (await db.select().from(verifications)).filter(
        (r) =>
          r.identifier.startsWith("meta-connect:") &&
          pendingConnectionBelongsTo(r.value, a.id),
      );
      verificationIds.push(...handshakes.map((r) => r.id));
      assert.equal(handshakes.length, 2);
      const [job] = await db
        .insert(publishJobs)
        .values({
          projectId: a.project.id,
          postId: post.id,
          platform: "facebook",
          accountId: "test-page",
          snapshot: { post, assets: [], externalUrl: "" },
          status: "preparing",
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 600000),
        })
        .returning();
      await t.test(
        "active publishing and uncertain submissions block deletion atomically",
        async () => {
          assert.equal((await remove()).status, 409);
          await db
            .update(publishJobs)
            .set({
              status: "submitting",
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(publishJobs.id, job.id));
          assert.equal((await remove()).status, 409);
          assert.equal(
            (
              await db
                .select()
                .from(postAssets)
                .where(eq(postAssets.postId, post.id))
            ).length,
            1,
          );
        },
      );
      await db
        .update(publishJobs)
        .set({ status: "queued" })
        .where(eq(publishJobs.id, job.id));
      await t.test(
        "removes the selected project, pending connections and jobs; keeps other projects and account access",
        async () => {
          const response = await remove();
          assert.equal(response.status, 200);
          assert.equal((await response.json()).deleted, true);
          assert.equal(
            (
              await db
                .select()
                .from(projects)
                .where(eq(projects.id, a.project.id))
            ).length,
            0,
          );
          for (const table of [
            posts,
            imageUploads,
            directUploads,
            uploadTokens,
            publishJobs,
            projectConnectors,
            postPublications,
          ])
            assert.equal(
              (
                await db
                  .select()
                  .from(table)
                  .where(eq(table.projectId, a.project.id))
              ).length,
              0,
            );
          const remaining = (await db.select().from(verifications)).filter(
            (r) => verificationIds.includes(r.id),
          );
          assert.equal(remaining.length, 1);
          assert.ok(
            pendingConnectionBelongsTo(remaining[0].value, a.id, keep.id),
          );
          assert.equal(
            (await db.select().from(posts).where(eq(posts.id, keptPost.id)))
              .length,
            1,
          );
          assert.equal(
            (
              await db
                .select()
                .from(projects)
                .where(eq(projects.id, b.project.id))
            ).length,
            1,
          );
          assert.equal(
            (
              await getAuth().api.getSession({
                headers: new Headers({ cookie: a.cookie }),
              })
            )?.user.id,
            a.id,
          );
          assert.equal(
            await verifyAccountToken(`Bearer ${token.mcpToken}`),
            a.id,
          );
          assert.equal((await resolveMcpProject(a.id)).id, keep.id);
          await assert.rejects(
            resolveMcpProject(a.id, a.project.id),
            /Project not found/,
          );
          await processPublishingJob(job.id); // stale queue callbacks cannot resurrect deleted work
          assert.ok(
            storage.mock.calls.some(
              (c) =>
                c.arguments[0] instanceof ListObjectsV2Command &&
                c.arguments[0].input.Prefix === `${a.project.id}/`,
            ),
          );
          assert.equal(
            (
              await db
                .select()
                .from(accountMediaCleanup)
                .where(eq(accountMediaCleanup.prefix, `${a.project.id}/`))
            ).length,
            1,
          );
        },
      );
      await t.test(
        "deleting the final project leaves the user account available to create a new one",
        async () => {
          const response = await DELETE(
            req(
              `/api/projects/${keep.id}`,
              { confirmation: keep.name },
              a.cookie,
              "DELETE",
            ),
            { params: Promise.resolve({ id: keep.id }) },
          );
          assert.equal(response.status, 200);
          assert.equal(
            (await db.select().from(projects).where(eq(projects.userId, a.id)))
              .length,
            0,
          );
          assert.equal(
            (
              await getAuth().api.getSession({
                headers: new Headers({ cookie: a.cookie }),
              })
            )?.user.id,
            a.id,
          );
          await assert.rejects(resolveMcpProject(a.id), /No projects found/);
        },
      );
    } finally {
      storage.mock.restore();
      if (projectIds.length) {
        await db.delete(accountMediaCleanup).where(
          inArray(
            accountMediaCleanup.prefix,
            projectIds.map((id) => `${id}/`),
          ),
        );
        await db
          .delete(directUploads)
          .where(inArray(directUploads.projectId, projectIds));
        await db
          .delete(imageUploads)
          .where(inArray(imageUploads.projectId, projectIds));
        await db.delete(posts).where(inArray(posts.projectId, projectIds));
        await db.delete(projects).where(inArray(projects.id, projectIds));
      }
      if (verificationIds.length)
        await db
          .delete(verifications)
          .where(inArray(verifications.id, verificationIds));
      if (created.length)
        await db.delete(users).where(inArray(users.id, created));
      process.env = env;
      await closeDb();
    }
  },
);
