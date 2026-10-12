import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import { and, eq, sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  users,
  projects,
  posts,
  publishJobs,
  postPublications,
  projectConnectors,
} from "../src/db/schema";
import { createProject } from "../src/lib/projects";
import { createPost, deletePost, getPostImage } from "../src/lib/store";
import {
  enqueuePublication,
  processPublishingJob,
} from "../src/lib/publish-jobs";
import { connectors } from "../src/lib/connectors/registry";
import { listPublications, managePublication } from "../src/lib/publications";
import {
  publicationCapabilities,
  safePublicationLink,
} from "../src/lib/connectors/publication-capabilities";
import {
  facebookPublications,
  instagramPublications,
  linkedinPublications,
} from "../src/lib/connectors/publication-adapters";
import { publishMeta } from "../src/lib/connectors/meta";
import { GET as listRoute } from "../src/app/api/publications/route";
import { DELETE as deleteRoute } from "../src/app/api/publications/[id]/route";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test(
  "publication records survive jobs/drafts, fence account changes and isolate projects",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const env = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: "development",
      QUEUE_DRIVER: "local",
      LOG_LEVEL: "error",
    });
    delete process.env.VERCEL;
    const userId = randomUUID();
    let projectId = "";
    const fb = { ...connectors.facebook },
      li = { ...connectors.linkedin };
    try {
      await getDb()
        .insert(users)
        .values({
          id: userId,
          name: "Publication test",
          email: `${userId}@example.test`,
        });
      projectId = (await createProject(userId, { name: "Publication test" }))
        .project.id;
      await getDb()
        .insert(projectConnectors)
        .values([
          {
            projectId,
            provider: "facebook",
            accountId: "original-page",
            accessToken: "private-test-token",
          },
          {
            projectId,
            provider: "linkedin",
            accountId: "urn:li:person:original",
            accessToken: "private-test-token",
          },
        ]);
      const post = await createPost(projectId, {
        title: "Two destinations",
        caption: "Approved caption",
        platforms: ["facebook", "linkedin"],
      });
      connectors.facebook.publish = async () => "fb-remote-id";
      connectors.linkedin.publish = async () => "urn:li:share:1234";
      const queued = await enqueuePublication(projectId, post.id);
      for (const id of queued.jobIds) await processPublishingJob(id);
      let copies = await listPublications(projectId, post.id);
      assert.equal(copies.length, 2);
      assert.equal(
        copies.find((p) => p.platform === "facebook")?.accountId,
        "original-page",
      );
      assert.equal(
        (await getPostImage(projectId, post.id)).publications?.length,
        2,
      );
      for (const id of queued.jobIds) await processPublishingJob(id);
      assert.equal((await listPublications(projectId)).length, 2);
      const publication = copies.find((p) => p.platform === "facebook")!;
      let deletes = 0;
      connectors.facebook.publications = {
        update: async (_ctx, caption) => {
          assert.equal(caption, "Edited copy");
        },
        delete: async () => {
          deletes++;
        },
      };
      await assert.rejects(
        managePublication(randomUUID(), publication.id, "delete"),
        /not found/,
      );
      assert.equal(deletes, 0);
      await getDb()
        .update(projectConnectors)
        .set({ accountId: "different-page" })
        .where(
          and(
            eq(projectConnectors.projectId, projectId),
            eq(projectConnectors.provider, "facebook"),
          ),
        );
      await assert.rejects(
        managePublication(projectId, publication.id, "delete"),
        /original publishing account/,
      );
      assert.equal(deletes, 0);
      await getDb()
        .update(projectConnectors)
        .set({ accountId: "original-page" })
        .where(
          and(
            eq(projectConnectors.projectId, projectId),
            eq(projectConnectors.provider, "facebook"),
          ),
        );
      await managePublication(projectId, publication.id, "edit", "Edited copy");
      assert.equal(
        (await getPostImage(projectId, post.id)).caption,
        "Approved caption",
      );
      await deletePost(projectId, post.id);
      copies = await listPublications(projectId);
      assert.equal(copies.length, 2);
      assert.ok(copies.every((p) => p.postId === null));
      assert.equal(
        copies.find((p) => p.id === publication.id)?.caption,
        "Edited copy",
      );
      connectors.facebook.publications.delete = async () => {
        throw new Error("Network timeout");
      };
      await assert.rejects(
        managePublication(projectId, publication.id, "delete"),
      );
      assert.equal(
        (await listPublications(projectId)).find((p) => p.id === publication.id)
          ?.status,
        "published",
      );
      connectors.facebook.publications.delete = async () => {
        deletes++;
      };
      await managePublication(projectId, publication.id, "delete");
      await managePublication(projectId, publication.id, "delete");
      assert.equal(deletes, 1);
      assert.equal(
        (await listPublications(projectId)).find(
          (p) => p.platform === "linkedin",
        )?.status,
        "published",
      );
      const legacy = await createPost(projectId, {
        title: "Legacy",
        caption: "Legacy text",
        platforms: ["facebook"],
      });
      await getDb()
        .update(posts)
        .set({ results: { facebook: "legacy-fb" }, status: "published" })
        .where(eq(posts.id, legacy.id));
      const known = await createPost(projectId, {
        title: "Legacy job",
        caption: "Current draft text",
        platforms: ["facebook"],
      });
      await getDb()
        .update(posts)
        .set({ results: { facebook: "legacy-known" }, status: "published" })
        .where(eq(posts.id, known.id));
      await getDb()
        .insert(publishJobs)
        .values({
          projectId,
          postId: known.id,
          platform: "facebook",
          accountId: "historical-page",
          status: "published",
          remoteId: "legacy-known",
          snapshot: {
            post: { ...known, caption: "Originally approved" },
            assets: [],
            externalUrl: "",
          },
        });
      const migration = await readFile(
        new URL("../drizzle/0014_post_publications.sql", import.meta.url),
        "utf8",
      );
      const backfill = migration
        .slice(migration.indexOf("-- Durable jobs know"))
        .replace(
          "FROM publish_jobs WHERE",
          `FROM publish_jobs WHERE project_id = '${projectId}' AND`,
        )
        .replace(
          "WHERE r.key IN",
          `WHERE p.project_id = '${projectId}' AND r.key IN`,
        );
      await getDb().execute(sql.raw(backfill));
      await getDb().execute(sql.raw(backfill));
      const knownCopies = await listPublications(projectId, known.id);
      assert.equal(knownCopies.length, 1);
      assert.equal(knownCopies[0].accountId, "historical-page");
      assert.equal(knownCopies[0].caption, "Originally approved");
      const legacyCopies = await listPublications(projectId, legacy.id);
      assert.equal(legacyCopies.length, 1);
      assert.equal(legacyCopies[0].accountId, null);
      await assert.rejects(
        managePublication(projectId, legacyCopies[0].id, "delete"),
        /not supported/,
      );
      const origin = process.env.APP_URL!;
      assert.equal(
        (
          await listRoute(
            new Request(`${origin}/api/publications?projectId=${projectId}`),
          )
        ).status,
        401,
      );
      assert.equal(
        (
          await deleteRoute(
            new Request(
              `${origin}/api/publications/${publication.id}?projectId=${projectId}`,
              { method: "DELETE" },
            ),
            { params: Promise.resolve({ id: publication.id }) },
          )
        ).status,
        401,
      );
    } finally {
      Object.assign(connectors.facebook, fb);
      Object.assign(connectors.linkedin, li);
      if (projectId) {
        await getDb()
          .delete(postPublications)
          .where(eq(postPublications.projectId, projectId));
        await getDb().delete(posts).where(eq(posts.projectId, projectId));
        await getDb().delete(projects).where(eq(projects.id, projectId));
      }
      await getDb().delete(users).where(eq(users.id, userId));
      await closeDb();
      process.env = env;
    }
  },
);

test("connector management uses the saved remote ID and confirmed provider results", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  let response = Response.json({
    id: "remote",
    permalink: "https://www.instagram.com/p/test/",
    like_count: 8,
    comments_count: 2,
  });
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return response.clone();
  };
  const context = {
    publication: {
      id: randomUUID(),
      projectId: randomUUID(),
      postId: null,
      platform: "instagram" as const,
      accountId: "account",
      remotePostId: "published-id",
      caption: "Original",
      mediaKind: "IMAGE",
      permalink: null,
      publishedAt: new Date().toISOString(),
      status: "published" as const,
      metrics: {},
      refreshedAt: null,
    },
    connection: {
      id: randomUUID(),
      projectId: randomUUID(),
      provider: "instagram" as const,
      accountId: "account",
      accountName: "",
      accessToken: "private-token",
      refreshToken: null,
      expiresAt: null,
      scopes: [],
      metadata: { apiHost: "graph.instagram.com" },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    signal: AbortSignal.timeout(30000),
  };
  try {
    response = Response.json({
      id: "photo-object",
      post_id: "page_published-post",
    });
    const photoPost = await publishMeta({
      connection: { ...context.connection, provider: "facebook" },
      post: {
        id: randomUUID(),
        projectId: randomUUID(),
        title: "Photo",
        caption: "Caption",
        platforms: ["facebook"],
        assets: [],
        imageUrl: "",
        source: "Manual",
        status: "draft",
        createdAt: new Date().toISOString(),
        results: {},
      },
      assets: [],
      urls: ["https://example.test/photo.jpg"],
      signal: context.signal,
    });
    assert.equal(photoPost, "page_published-post");
    calls.length = 0;
    response = Response.json({
      id: "remote",
      permalink: "https://www.instagram.com/p/test/",
      like_count: 8,
      comments_count: 2,
    });
    const details = await instagramPublications.get!(context);
    assert.deepEqual(details.metrics, { likes: 8, comments: 2 });
    assert.equal(new URL(calls[0].url).hostname, "graph.instagram.com");
    assert.equal(
      new URL(calls[0].url).pathname.endsWith("/published-id"),
      true,
    );
    assert.equal(
      new Headers(calls[0].init?.headers).get("Authorization"),
      "Bearer private-token",
    );
    assert.equal(publicationCapabilities(context.publication).delete, false);
    assert.equal(
      publicationCapabilities({ ...context.publication, platform: "facebook" })
        .edit,
      false,
    );
    response = Response.json(
      { error: { message: "Permission denied" } },
      { status: 403 },
    );
    await assert.rejects(
      facebookPublications.delete!({
        ...context,
        publication: { ...context.publication, platform: "facebook" },
      }),
      /Permission denied/,
    );
    response = Response.json(false);
    await assert.rejects(
      facebookPublications.update!(
        {
          ...context,
          publication: {
            ...context.publication,
            platform: "facebook",
            mediaKind: "TEXT",
          },
        },
        "Unconfirmed update",
      ),
      /did not confirm/,
    );
    response = Response.json(true);
    await facebookPublications.delete!({
      ...context,
      publication: { ...context.publication, platform: "facebook" },
    });
    assert.equal(calls.at(-1)?.init?.method, "DELETE");
    response = new Response(null, { status: 204 });
    const linkedin = {
      ...context,
      publication: {
        ...context.publication,
        platform: "linkedin" as const,
        remotePostId: "urn:li:share:123",
      },
    };
    await linkedinPublications.update!(linkedin, "Edited #caption");
    assert.equal(
      new Headers(calls.at(-1)?.init?.headers).get("X-RestLi-Method"),
      "PARTIAL_UPDATE",
    );
    assert.equal(
      JSON.parse(String(calls.at(-1)?.init?.body)).patch.$set.commentary,
      "Edited \\#caption",
    );
    await linkedinPublications.delete!(linkedin);
    assert.equal(calls.at(-1)?.init?.method, "DELETE");
    assert.ok(calls.at(-1)?.url.endsWith("urn%3Ali%3Ashare%3A123"));
    assert.equal(
      safePublicationLink(
        "instagram",
        "https://instagram.com.evil.test/p/test",
      ),
      null,
    );
    assert.equal(safePublicationLink("instagram", "javascript:alert(1)"), null);
    assert.equal(
      safePublicationLink("instagram", "https://www.instagram.com/p/test/"),
      "https://www.instagram.com/p/test/",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
