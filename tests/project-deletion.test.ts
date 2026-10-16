import { acceptedSignup } from "./helpers/terms";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { isStored, storeFile } from "./helpers/storage";
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
import { client, rejectsWith } from "./helpers/orpc";
loadEnvConfig(process.cwd());
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
      FACEBOOK_APP_ID: "123456",
      FACEBOOK_APP_SECRET: "test-secret",
    });
    // The local provider's bucket, so rows and new uploads share one location.
    const bucket = "media";
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
      const [project] = await db
        .insert(projects)
        .values({ userId: user.id, name: "Deletion fixture" })
        .returning();
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
      // Cross-site requests are refused by the proxy for every API route
      // (tests/public-pages.test.ts).
      const remove = (confirmation = a.project.name, cookies = a.cookie) =>
        client(cookies).projects.delete({ id: a.project.id, confirmation });
      await t.test(
        "requires session, exact confirmation and ownership",
        async () => {
          await rejectsWith(remove(a.project.name, ""), "UNAUTHORIZED");
          await rejectsWith(remove(a.project.name, b.cookie), "NOT_FOUND");
          await rejectsWith(remove("wrong project"), "BAD_REQUEST");
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
        storageProvider: "local",
        imageBucket: bucket,
        imageKey: `${a.project.id}/image.jpg`,
      });
      await db.insert(imageUploads).values({
        projectId: a.project.id,
        storageProvider: "local",
        imageBucket: bucket,
        imageKey: `${a.project.id}/unused.jpg`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await db.insert(directUploads).values({
        projectId: a.project.id,
        storageProvider: "local",
        imageBucket: bucket,
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
      // Real files behind the media rows, plus one no row references: the
      // prefix sweep must remove it too. The kept project's file must stay.
      for (const key of [
        "image.jpg",
        "unused.jpg",
        "pending/file",
        "stray.jpg",
      ])
        storeFile(bucket, `${a.project.id}/${key}`);
      storeFile(bucket, `${keep.id}/kept.jpg`);
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
          await rejectsWith(remove(), "CONFLICT");
          await db
            .update(publishJobs)
            .set({
              status: "submitting",
              leaseToken: null,
              leaseExpiresAt: null,
            })
            .where(eq(publishJobs.id, job.id));
          await rejectsWith(remove(), "CONFLICT");
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
          await remove();
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
          for (const key of [
            "image.jpg",
            "unused.jpg",
            "pending/file",
            "stray.jpg",
          ])
            assert.ok(
              !isStored(bucket, `${a.project.id}/${key}`),
              `${key} should be purged with the project`,
            );
          assert.ok(
            isStored(bucket, `${keep.id}/kept.jpg`),
            "other projects keep their media",
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
          await client(a.cookie).projects.delete({
            id: keep.id,
            confirmation: keep.name,
          });
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
