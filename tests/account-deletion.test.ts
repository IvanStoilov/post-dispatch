import { acceptedSignup } from "./helpers/terms";
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  users,
  sessions,
  projects,
  posts,
  postAssets,
  imageUploads,
  directUploads,
  publishJobs,
  accountMcpTokens,
  verifications,
  accountMediaCleanup,
  projectConnectors,
  postPublications,
} from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { appOrigin } from "../src/lib/origins";
import { createPost } from "../src/lib/store";
import {
  recoverAccountMediaCleanup,
  limitDeletionAttempts,
} from "../src/lib/account-deletion";
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";
import { DELETE } from "../src/app/api/account/route";
loadEnvConfig(process.cwd());
process.env.STORAGE_PROVIDER = "s3";
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test(
  "self-service deletion authenticates, fences publishing, removes owned data and retries media cleanup",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const db = getDb(),
      env = { ...process.env },
      created: string[] = [],
      projectIds: string[] = [];
    process.env.MAIL_PROVIDER = "console";
    process.env.AWS_S3_BUCKET = "account-deletion-test";
    const storageResponse = async (command: unknown) => {
      if (command instanceof ListObjectsV2Command)
        return { Contents: [], IsTruncated: false };
      if (command instanceof DeleteObjectsCommand) return {};
      if (command instanceof ListBucketsCommand)
        return { Buckets: [{ Name: "account-deletion-test" }] };
      throw new Error("Unexpected storage request");
    };
    const purge = mock.method(S3Client.prototype, "send", storageResponse);
    const cookie = (r: Response) =>
      r.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
    const req = (
      path: string,
      body: unknown,
      cookies = "",
      origin = appOrigin(),
    ) =>
      new Request(appOrigin() + path, {
        method: path === "/api/account" ? "DELETE" : "POST",
        headers: {
          origin,
          cookie: cookies,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          path.endsWith("/sign-up/email") ? acceptedSignup(body) : body,
        ),
      });
    async function fixture() {
      const email = `delete-${randomUUID()}@example.test`,
        password = `Password-${randomUUID()}`;
      const signup = await getAuth().handler(
        req("/api/auth/sign-up/email", {
          name: "Deletion test",
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
      return {
        id: user.id,
        password,
        cookie: cookie(signin),
        projectId: project.id,
      };
    }
    try {
      const a = await fixture(),
        b = await fixture();
      const valid = { password: a.password, confirmation: "DELETE" };
      await t.test(
        "authentication, same-origin, explicit confirmation, and password are required",
        async () => {
          assert.equal((await DELETE(req("/api/account", valid))).status, 401);
          assert.equal(
            (
              await DELETE(
                req("/api/account", valid, a.cookie, "https://evil.example"),
              )
            ).status,
            403,
          );
          assert.equal(
            (
              await DELETE(
                req("/api/account", { ...valid, confirmation: "" }, a.cookie),
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await DELETE(
                req("/api/account", { ...valid, userId: b.id }, a.cookie),
              )
            ).status,
            400,
          );
          assert.equal(
            (
              await DELETE(
                req(
                  "/api/account",
                  { ...valid, password: "wrong-password" },
                  a.cookie,
                ),
              )
            ).status,
            400,
          );
          assert.equal(
            (await db.select().from(users).where(eq(users.id, a.id))).length,
            1,
          );
        },
      );
      const post = await createPost(a.projectId, {
        title: "Private draft",
        caption: "Private text",
        platforms: ["facebook"],
      });
      const object = {
        imageKey: `${a.projectId}/test.jpg`,
        imageBucket: "account-deletion-test",
      };
      await db.insert(postAssets).values({
        id: randomUUID(),
        postId: post.id,
        position: 0,
        kind: "IMAGE",
        mimeType: "image/jpeg",
        ...object,
      });
      await db.insert(imageUploads).values({
        projectId: a.projectId,
        ...object,
        imageKey: `${a.projectId}/unclaimed.jpg`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await db.insert(directUploads).values({
        projectId: a.projectId,
        ...object,
        imageKey: `${a.projectId}/pending/upload`,
        mimeType: "image/jpeg",
        fileSize: 100,
        completionTokenHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      await db.insert(projectConnectors).values({
        projectId: a.projectId,
        provider: "facebook",
        accountId: "page",
        accessToken: "test-credential",
      });
      await db
        .insert(accountMcpTokens)
        .values({ userId: a.id, tokenHash: "b".repeat(64) });
      await db.insert(postPublications).values({
        projectId: a.projectId,
        postId: post.id,
        platform: "facebook",
        remotePostId: "remote-post",
        publishedAt: new Date(),
      });
      await db.insert(verifications).values([
        {
          id: randomUUID(),
          identifier: `reset-password:${randomUUID()}`,
          value: a.id,
          expiresAt: new Date(Date.now() + 3600000),
        },
        {
          id: randomUUID(),
          identifier: randomUUID(),
          value: JSON.stringify({ type: "authorization_code", userId: a.id }),
          expiresAt: new Date(Date.now() + 3600000),
        },
      ]);
      const [job] = await db
        .insert(publishJobs)
        .values({
          projectId: a.projectId,
          postId: post.id,
          platform: "facebook",
          accountId: "page",
          snapshot: { post, assets: [], externalUrl: "" },
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 600000),
        })
        .returning();
      await t.test(
        "an active publisher prevents deletion without partial data loss",
        async () => {
          const response = await DELETE(req("/api/account", valid, a.cookie));
          assert.equal(response.status, 409);
          assert.match(
            (await response.json()).error,
            /publication.*processed/i,
          );
          assert.equal(
            (await db.select().from(users).where(eq(users.id, a.id))).length,
            1,
          );
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
        .set({ leaseToken: null, leaseExpiresAt: null, status: "queued" })
        .where(eq(publishJobs.id, job.id));
      await t.test(
        "deletion removes only the authenticated account and persists scoped media cleanup",
        async () => {
          const response = await DELETE(req("/api/account", valid, a.cookie));
          assert.equal(response.status, 200);
          assert.equal((await response.json()).deleted, true);
          assert.equal(
            (await db.select().from(users).where(eq(users.id, a.id))).length,
            0,
          );
          assert.equal(
            (await db.select().from(projects).where(eq(projects.userId, a.id)))
              .length,
            0,
          );
          for (const table of [
            posts,
            imageUploads,
            directUploads,
            publishJobs,
            projectConnectors,
            postPublications,
          ])
            assert.equal(
              (
                await db
                  .select()
                  .from(table)
                  .where(eq(table.projectId, a.projectId))
              ).length,
              0,
            );
          assert.equal(
            (
              await db
                .select()
                .from(accountMcpTokens)
                .where(eq(accountMcpTokens.userId, a.id))
            ).length,
            0,
          );
          assert.equal(
            (await db.select().from(sessions).where(eq(sessions.userId, a.id)))
              .length,
            0,
          );
          assert.equal(
            await getAuth().api.getSession({
              headers: new Headers({ cookie: a.cookie }),
            }),
            null,
          );
          assert.equal(
            (await db.select().from(verifications)).filter(
              (v) => v.value === a.id || v.value.includes(`"userId":"${a.id}"`),
            ).length,
            0,
          );
          assert.equal(
            (await db.select().from(users).where(eq(users.id, b.id))).length,
            1,
          );
          const targets = await db
            .select()
            .from(accountMediaCleanup)
            .where(eq(accountMediaCleanup.prefix, `${a.projectId}/`));
          assert.equal(targets.length, 1);
          assert.equal(targets[0].objectKeys.length, 0); // initial purge succeeded
          assert.ok(
            purge.mock.calls.some(
              (c) =>
                c.arguments[0] instanceof ListObjectsV2Command &&
                c.arguments[0].input.Prefix === `${a.projectId}/`,
            ),
          );
        },
      );
      await t.test(
        "storage failures retain retry state; the final sweep removes the cleanup manifest",
        async () => {
          await db
            .update(accountMediaCleanup)
            .set({ nextAttemptAt: new Date(0), finalSweepAfter: new Date(0) })
            .where(eq(accountMediaCleanup.prefix, `${a.projectId}/`));
          purge.mock.mockImplementation(async () => {
            throw new Error("Simulated storage outage");
          });
          await recoverAccountMediaCleanup();
          assert.equal(
            (
              await db
                .select()
                .from(accountMediaCleanup)
                .where(eq(accountMediaCleanup.prefix, `${a.projectId}/`))
            ).length,
            1,
          );
          purge.mock.mockImplementation(storageResponse);
          await db
            .update(accountMediaCleanup)
            .set({ nextAttemptAt: new Date(0) })
            .where(eq(accountMediaCleanup.prefix, `${a.projectId}/`));
          await recoverAccountMediaCleanup();
          assert.equal(
            (
              await db
                .select()
                .from(accountMediaCleanup)
                .where(eq(accountMediaCleanup.prefix, `${a.projectId}/`))
            ).length,
            0,
          );
        },
      );
      await t.test(
        "deletion password attempts are limited persistently",
        async () => {
          for (let attempt = 0; attempt < 5; attempt++)
            await limitDeletionAttempts(b.id);
          await assert.rejects(
            limitDeletionAttempts(b.id),
            /Too many deletion attempts/,
          );
        },
      );
    } finally {
      purge.mock.restore();
      if (projectIds.length) {
        await db.delete(accountMediaCleanup).where(
          inArray(
            accountMediaCleanup.prefix,
            projectIds.map((id) => `${id}/`),
          ),
        );
        await db.delete(posts).where(inArray(posts.projectId, projectIds));
        await db.delete(projects).where(inArray(projects.id, projectIds));
      }
      if (created.length) {
        await db.delete(verifications).where(
          inArray(
            verifications.identifier,
            created.map((id) => `account-deletion-attempts:${id}`),
          ),
        );
        await db.delete(users).where(inArray(users.id, created));
      }
      process.env = env;
      await closeDb();
    }
  },
);
