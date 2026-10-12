import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { and, eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  posts,
  projects,
  users,
  projectConnectors,
  publishJobs,
} from "../src/db/schema";
import { createProject } from "../src/lib/projects";
import { createPost, editPost, getPostImage } from "../src/lib/store";
import { connectors } from "../src/lib/connectors/registry";
import {
  enqueuePublication,
  processPublishingJob,
  retryFailedPublication,
  recoverPublishingJobs,
} from "../src/lib/publish-jobs";
import { GET as recoveryRoute } from "../src/app/api/cron/publishing/route";
import type { Platform } from "../src/lib/types";
import { MediaPending } from "../src/lib/connectors/types";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test(
  "durable publishing: persistence, fencing, recovery, partial success and uncertain submissions",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const userId = randomUUID();
    let projectId = "";
    const originals = Object.fromEntries(
      Object.entries(connectors).map(([name, adapter]) => [
        name,
        adapter.publish,
      ]),
    );
    const originalFetch = globalThis.fetch;
    const env = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: "development",
      QUEUE_DRIVER: "local",
      LOG_LEVEL: "error",
    });
    delete process.env.VERCEL;
    const draft = async (platforms: Platform[] = ["facebook"]) =>
      createPost(projectId, {
        title: "Durable job",
        caption: "Approved caption",
        platforms,
      });
    const jobs = (postId: string) =>
      getDb().select().from(publishJobs).where(eq(publishJobs.postId, postId));
    const due = async (id: string) =>
      getDb()
        .update(publishJobs)
        .set({
          dispatchAt: new Date(0),
          nextAttemptAt: new Date(0),
          leaseExpiresAt: new Date(0),
        })
        .where(eq(publishJobs.id, id));
    try {
      await getDb()
        .insert(users)
        .values({
          id: userId,
          name: "Jobs test",
          email: `${userId}@example.test`,
        });
      projectId = (
        await createProject(userId, { name: "Durable publishing tests" })
      ).project.id;
      await getDb()
        .insert(projectConnectors)
        .values([
          {
            projectId,
            provider: "facebook",
            accountId: "page-job",
            accessToken: "private-token",
          },
          {
            projectId,
            provider: "linkedin",
            accountId: "urn:li:person:jobs",
            accessToken: "private-token",
          },
          {
            projectId,
            provider: "instagram",
            accountId: "ig-job",
            accessToken: "private-token",
          },
        ]);
      await t.test(
        "disconnected channels reject publishing without creating jobs",
        async () => {
          const post = await draft();
          await getDb()
            .update(posts)
            .set({ platforms: ["instagram"] })
            .where(eq(posts.id, post.id));
          await getDb()
            .update(projectConnectors)
            .set({ expiresAt: new Date(0) })
            .where(
              and(
                eq(projectConnectors.projectId, projectId),
                eq(projectConnectors.provider, "instagram"),
              ),
            );
          try {
            await assert.rejects(
              enqueuePublication(projectId, post.id),
              /Connect instagram before publishing/,
            );
            assert.equal((await jobs(post.id)).length, 0);
            const [saved] = await getDb()
              .select()
              .from(posts)
              .where(eq(posts.id, post.id));
            assert.equal(saved.status, "draft");
          } finally {
            await getDb()
              .update(projectConnectors)
              .set({ expiresAt: null })
              .where(
                and(
                  eq(projectConnectors.projectId, projectId),
                  eq(projectConnectors.provider, "instagram"),
                ),
              );
          }
        },
      );
      await t.test(
        "approval and outbox are atomic, ownership checked, repeated clicks idempotent",
        async () => {
          const post = await draft(["facebook", "linkedin"]);
          await assert.rejects(enqueuePublication(randomUUID(), post.id));
          const [a, b] = await Promise.all([
            enqueuePublication(projectId, post.id),
            enqueuePublication(projectId, post.id),
          ]);
          assert.deepEqual(new Set(a.jobIds), new Set(b.jobIds));
          assert.equal((await jobs(post.id)).length, 2);
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "publishing",
          );
          await assert.rejects(
            editPost(projectId, post.id, {
              title: "Changed",
              caption: "Changed",
              platforms: ["facebook"],
            }),
          );
          assert.equal(
            (await jobs(post.id))[0].snapshot.post.caption,
            "Approved caption",
          );
          // Prevent this unfinished fixture from being picked up by later recovery tests.
          await getDb()
            .update(publishJobs)
            .set({ status: "failed" })
            .where(eq(publishJobs.postId, post.id));
          await getDb()
            .update(posts)
            .set({ status: "needs_review" })
            .where(eq(posts.id, post.id));
        },
      );
      await t.test(
        "processing waits in Postgres and resumes its saved media",
        async () => {
          let calls = 0;
          connectors.facebook.publish = async ({ progress }) => {
            calls++;
            if (calls === 1) {
              await progress!.checkpoint({ mediaIds: ["saved-media"] });
              throw new MediaPending(60);
            }
            assert.deepEqual(progress!.state, { mediaIds: ["saved-media"] });
            await progress!.beforeSubmit();
            return "processed-media";
          };
          const post = await draft();
          const { jobIds } = await enqueuePublication(projectId, post.id);
          await processPublishingJob(jobIds[0]);
          const [job] = await jobs(post.id);
          assert.equal(job.status, "waiting");
          assert.equal(job.polls, 1);
          assert.ok(job.nextAttemptAt > new Date());
          await processPublishingJob(job.id);
          assert.equal(calls, 1);
          await due(job.id);
          await processPublishingJob(job.id);
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "published",
          );
        },
      );
      await t.test(
        "preparation failures exhaust their retry budget without a final submission",
        async () => {
          let calls = 0;
          connectors.facebook.publish = async () => {
            calls++;
            throw new Error("private-token upload rejected");
          };
          const post = await draft();
          const { jobIds } = await enqueuePublication(projectId, post.id);
          for (let i = 0; i < 5; i++) {
            await due(jobIds[0]);
            await processPublishingJob(jobIds[0]);
          }
          const [job] = await jobs(post.id);
          assert.equal(calls, 5);
          assert.equal(job.status, "failed");
          assert.ok(!job.error!.includes("private-token"));
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "needs_review",
          );
        },
      );
      await t.test(
        "failed preparation retries without repeating a successful channel",
        async () => {
          let fb = 0,
            li = 0;
          connectors.facebook.publish = async ({ progress }) => {
            fb++;
            await progress!.beforeSubmit();
            return "fb-saved";
          };
          connectors.linkedin.publish = async ({ progress }) => {
            li++;
            if (li === 1) throw new Error("Temporary upload failure");
            await progress!.beforeSubmit();
            return "li-saved";
          };
          const post = await draft(["facebook", "linkedin"]);
          const { jobIds } = await enqueuePublication(projectId, post.id);
          for (const id of jobIds) await processPublishingJob(id);
          let rows = await jobs(post.id);
          const retry = rows.find((j) => j.platform === "linkedin")!;
          assert.equal(retry.status, "queued");
          assert.equal(retry.attempts, 1);
          assert.equal(
            (await getPostImage(projectId, post.id)).results.facebook,
            "fb-saved",
          );
          await due(retry.id);
          await processPublishingJob(retry.id);
          for (const id of jobIds) await processPublishingJob(id);
          rows = await jobs(post.id);
          assert.ok(rows.every((j) => j.status === "published"));
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "published",
          );
          assert.equal(fb, 1);
          assert.equal(li, 2);
        },
      );
      await t.test(
        "concurrent delivery cannot claim an active lease or publish twice",
        async () => {
          let release!: () => void, entered!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          const started = new Promise<void>((resolve) => {
            entered = resolve;
          });
          let count = 0;
          connectors.facebook.publish = async ({ progress }) => {
            count++;
            entered();
            await gate;
            await progress!.beforeSubmit();
            return "once";
          };
          const post = await draft();
          const { jobIds } = await enqueuePublication(projectId, post.id);
          const first = processPublishingJob(jobIds[0]);
          await started;
          try {
            await assert.rejects(
              processPublishingJob(jobIds[0]),
              /already leased/,
            );
          } finally {
            release();
          }
          await first;
          await processPublishingJob(jobIds[0]);
          assert.equal(count, 1);
        },
      );
      await t.test(
        "expired workers are fenced before any final submission",
        async () => {
          let finalCalls = 0;
          connectors.facebook.publish = async ({ progress }) => {
            await getDb()
              .update(publishJobs)
              .set({ leaseExpiresAt: new Date(0) })
              .where(eq(publishJobs.postId, post.id));
            await progress!.beforeSubmit();
            finalCalls++;
            return "should-not-happen";
          };
          const post = await draft();
          const { jobIds } = await enqueuePublication(projectId, post.id);
          await assert.rejects(
            processPublishingJob(jobIds[0]),
            /lease was lost/,
          );
          assert.equal(finalCalls, 0);
          let observed: unknown;
          connectors.facebook.publish = async ({ progress }) => {
            observed = progress!.state;
            await progress!.beforeSubmit();
            return "resumed";
          };
          await getDb()
            .update(publishJobs)
            .set({ state: { mediaIds: ["saved-photo"] } })
            .where(eq(publishJobs.id, jobIds[0]));
          await processPublishingJob(jobIds[0]);
          assert.deepEqual(observed, { mediaIds: ["saved-photo"] });
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "published",
          );
        },
      );
      await t.test(
        "lost publish responses reconcile and block automatic resubmission",
        async () => {
          let calls = 0;
          connectors.facebook.publish = async ({ progress }) => {
            calls++;
            await progress!.beforeSubmit();
            throw new Error("Lost response after remote publish");
          };
          const post = await draft();
          const { jobIds } = await enqueuePublication(projectId, post.id);
          await processPublishingJob(jobIds[0]);
          assert.equal((await jobs(post.id))[0].status, "needs_review");
          await processPublishingJob(jobIds[0]);
          await assert.rejects(
            retryFailedPublication(projectId, post.id),
            /Uncertain/,
          );
          assert.equal(calls, 1);
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "needs_review",
          );
        },
      );
      await t.test(
        "an interrupted submitting job checks its saved Instagram container",
        async () => {
          const post = await draft();
          const { jobIds } = await enqueuePublication(projectId, post.id);
          await getDb()
            .update(publishJobs)
            .set({
              platform: "instagram",
              accountId: "ig-job",
              status: "submitting",
              state: { containerId: "container-1" },
              leaseToken: randomUUID(),
              leaseExpiresAt: new Date(0),
            })
            .where(eq(publishJobs.id, jobIds[0]));
          let reconciled = 0;
          connectors.instagram.publish = async () => {
            throw new Error("Must never publish again");
          };
          globalThis.fetch = async (input) => {
            assert.ok(
              String(input).includes("/container-1?fields=status_code,status"),
            );
            reconciled++;
            return Response.json({ status_code: "PUBLISHED" });
          };
          await processPublishingJob(jobIds[0]);
          const [job] = await jobs(post.id);
          assert.equal(job.status, "needs_review");
          assert.match(job.error!, /confirms this container was published/);
          assert.equal(reconciled, 1);
          globalThis.fetch = originalFetch;
        },
      );
      await t.test(
        "safe manual retries skip completed destinations and reset preparation",
        async () => {
          connectors.facebook.publish = async ({ progress }) => {
            await progress!.beforeSubmit();
            return "completed-channel";
          };
          const post = await draft(["facebook", "linkedin"]);
          const { jobIds } = await enqueuePublication(projectId, post.id);
          const rows = await jobs(post.id);
          await processPublishingJob(
            rows.find((j) => j.platform === "facebook")!.id,
          );
          await getDb()
            .update(projectConnectors)
            .set({ accessToken: "" })
            .where(
              and(
                eq(projectConnectors.projectId, projectId),
                eq(projectConnectors.provider, "linkedin"),
              ),
            );
          await processPublishingJob(
            rows.find((j) => j.platform === "linkedin")!.id,
          );
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "needs_review",
          );
          await assert.rejects(retryFailedPublication(randomUUID(), post.id));
          await getDb()
            .update(projectConnectors)
            .set({ accessToken: "reconnected" })
            .where(
              and(
                eq(projectConnectors.projectId, projectId),
                eq(projectConnectors.provider, "linkedin"),
              ),
            );
          const ids = await retryFailedPublication(projectId, post.id);
          assert.equal(ids.length, 1);
          assert.ok(jobIds.includes(ids[0]));
          connectors.facebook.publish = async () => {
            throw new Error("Completed channel must be skipped");
          };
          connectors.linkedin.publish = async ({ progress }) => {
            assert.deepEqual(progress!.state, {});
            await progress!.beforeSubmit();
            return "retried-channel";
          };
          await processPublishingJob(ids[0]);
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "published",
          );
          assert.equal(
            (await getPostImage(projectId, post.id)).results.facebook,
            "completed-channel",
          );
        },
      );
      await t.test(
        "the recovery sweep delivers a committed outbox even without an initial enqueue",
        async () => {
          const post = await draft();
          await enqueuePublication(projectId, post.id);
          connectors.facebook.publish = async ({ progress }) => {
            await progress!.beforeSubmit();
            return "recovered-outbox";
          };
          await recoverPublishingJobs(20, projectId);
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "published",
          );
        },
      );
      await t.test(
        "recovery is authenticated, and orphaned older publishing requests need review",
        async () => {
          delete process.env.CRON_SECRET;
          assert.equal(
            (
              await recoveryRoute(
                new Request("http://localhost/api/cron/publishing"),
              )
            ).status,
            401,
          );
          process.env.CRON_SECRET = "recovery-secret";
          assert.equal(
            (
              await recoveryRoute(
                new Request("http://localhost/api/cron/publishing", {
                  headers: { authorization: "Bearer wrong" },
                }),
              )
            ).status,
            401,
          );
          const post = await draft();
          await getDb()
            .update(posts)
            .set({ status: "publishing", updatedAt: new Date(0).toISOString() })
            .where(eq(posts.id, post.id));
          await recoverPublishingJobs(20, projectId);
          assert.equal(
            (await getPostImage(projectId, post.id)).status,
            "needs_review",
          );
        },
      );
    } finally {
      for (const platform of Object.keys(connectors) as Platform[])
        connectors[platform].publish = originals[platform];
      globalThis.fetch = originalFetch;
      process.env = env;
      if (projectId) {
        await getDb().delete(posts).where(eq(posts.projectId, projectId));
        await getDb().delete(projects).where(eq(projects.id, projectId));
      }
      await getDb().delete(users).where(eq(users.id, userId));
      await closeDb();
    }
  },
);
