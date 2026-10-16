import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDb } from "../src/db";
import { client, rejectsWith, sent, testUsers } from "./helpers/orpc";

test(
  "publishing procedures require a session",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await rejectsWith(
      client().publishing.publish({
        projectId: randomUUID(),
        id: randomUUID(),
      }),
      "UNAUTHORIZED",
    );
  },
);

test(
  "publishing procedures publish posts and manage their copies",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const users = testUsers();
    // A fake Graph API: publishing and managing copies only reach Facebook.
    const realFetch = globalThis.fetch;
    const graph: string[] = [];
    let networkDown = false;
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).hostname !== "graph.facebook.com")
        return realFetch(input, init);
      graph.push(`${request.method} ${new URL(request.url).pathname}`);
      if (networkDown)
        return Response.json(
          { error: { message: "Service unavailable" } },
          { status: 503 },
        );
      return Response.json({ id: "page_1", success: true });
    };
    try {
      const a = await users.signedIn(),
        b = await users.signedIn();
      const { id: projectId } = await a.projects.create({ name: "Publishing" });
      const post = await a.posts.create({
        projectId,
        title: "Pricing",
        caption: "We raised prices 30% last month.",
        platforms: ["facebook"],
      });
      const ref = { projectId, id: post.id };

      await t.test("publishing needs every network connected", async () => {
        const error = await rejectsWith(a.publishing.publish(ref), "CONFLICT");
        assert.match(error.message, /Connect facebook/);
        assert.deepEqual(graph, []);
      });
      await a.projects.update({
        id: projectId,
        name: "Publishing",
        facebookPageId: "page",
        facebookPageToken: "test-token",
      });

      let copyId = "";
      await t.test("publish sends the post and records its copy", async () => {
        sent.length = 0;
        const queued = await a.publishing.publish(ref);
        assert.deepEqual(sent, [
          `POST /api/v1/projects/${projectId}/posts/${post.id}/publish`,
        ]);
        // Delivery continues after the response (here: right away).
        assert.equal(queued.status, "publishing");
        assert.equal(graph.filter((call) => call.endsWith("/feed")).length, 1);
        const published = (await a.posts.list({ projectId })).find(
          (p) => p.id === post.id,
        )!;
        assert.equal(published.status, "published");
        assert.equal(published.results.facebook, "page_1");
        const copies = await a.publications.list({
          projectId,
          postId: post.id,
        });
        assert.equal(copies.length, 1);
        assert.equal(copies[0].mediaKind, "TEXT");
        copyId = copies[0].id;
      });

      await t.test("publishing again doesn't post twice", async () => {
        const again = await a.publishing.publish(ref);
        assert.equal(again.status, "published");
        assert.equal(graph.filter((call) => call.endsWith("/feed")).length, 1);
      });

      await t.test("retry needs a failed publication", async () => {
        const error = await rejectsWith(a.publishing.retry(ref), "CONFLICT");
        assert.match(error.message, /No failed publication/);
      });

      await t.test("other users can't publish or see copies", async () => {
        await rejectsWith(b.publishing.publish(ref), "NOT_FOUND");
        await rejectsWith(b.publications.list({ projectId }), "NOT_FOUND");
        await rejectsWith(
          b.publications.delete({ projectId, id: copyId }),
          "NOT_FOUND",
        );
      });

      await t.test("network failures are reported as unconfirmed", async () => {
        networkDown = true;
        try {
          const error = await rejectsWith(
            a.publications.refresh({ projectId, id: copyId }),
            "BAD_GATEWAY",
          );
          assert.match(error.message, /could not be confirmed/);
          // The token never reaches the client.
          assert.ok(!JSON.stringify(error).includes("test-token"));
        } finally {
          networkDown = false;
        }
      });

      await t.test(
        "edit and delete apply once the network confirms",
        async () => {
          sent.length = 0;
          const edited = await a.publications.edit({
            projectId,
            id: copyId,
            caption: "  Updated caption  ",
          });
          assert.equal(edited.caption, "Updated caption");
          const deleted = await a.publications.delete({
            projectId,
            id: copyId,
          });
          assert.equal(deleted.status, "deleted");
          assert.deepEqual(sent, [
            `PATCH /api/v1/projects/${projectId}/publications/${copyId}`,
            `DELETE /api/v1/projects/${projectId}/publications/${copyId}`,
          ]);
          assert.ok(graph.at(-1)!.startsWith("DELETE "));
        },
      );
    } finally {
      globalThis.fetch = realFetch;
      try {
        await users.cleanup();
      } finally {
        await closeDb();
      }
    }
  },
);
