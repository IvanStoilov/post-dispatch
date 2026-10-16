import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { projects } from "../src/db/schema";
import { client, rejectsWith, sent, testUsers } from "./helpers/orpc";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Better Auth opens the database on startup, so even this check needs one.
test(
  "projects procedures require a session",
  { skip: !process.env.DATABASE_URL },
  async () => {
    await rejectsWith(client().projects.list(), "UNAUTHORIZED");
    await rejectsWith(client().projects.create({ name: "x" }), "UNAUTHORIZED");
  },
);

test(
  "projects procedures list and create for the signed-in user",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const users = testUsers();
    try {
      const a = await users.signedIn(),
        b = await users.signedIn();
      let projectId = "";
      await t.test("create returns the typed project", async () => {
        const project = await a.projects.create({ name: "  oRPC brand  " });
        assert.equal(project.name, "oRPC brand");
        projectId = project.id;
      });
      await t.test("list includes it only for its owner", async () => {
        assert.ok((await a.projects.list()).some((p) => p.id === projectId));
        assert.ok(!(await b.projects.list()).some((p) => p.id === projectId));
      });
      await t.test("the client sends REST requests", async () => {
        sent.length = 0;
        await a.projects.list();
        await a.projects.update({ id: projectId, name: "oRPC brand" });
        await a.projects.disconnectChannel({
          id: projectId,
          provider: "facebook",
        });
        assert.deepEqual(sent, [
          "GET /api/v1/projects",
          `PUT /api/v1/projects/${projectId}`,
          `DELETE /api/v1/projects/${projectId}/channels/facebook`,
        ]);
      });
      await t.test("update renames the project for its owner", async () => {
        const updated = await a.projects.update({
          id: projectId,
          name: "Renamed brand",
        });
        assert.equal(updated.name, "Renamed brand");
      });
      await t.test("update hides projects the user doesn't own", async () => {
        await rejectsWith(
          b.projects.update({ id: projectId, name: "Taken over" }),
          "NOT_FOUND",
        );
        await rejectsWith(
          a.projects.update({ id: randomUUID(), name: "Missing" }),
          "NOT_FOUND",
        );
        const [row] = await getDb()
          .select()
          .from(projects)
          .where(eq(projects.id, projectId));
        assert.equal(row.name, "Renamed brand");
      });
      await t.test("invalid input is rejected before the handler", async () => {
        const invalid = await rejectsWith(
          a.projects.create({ name: "   " }),
          "BAD_REQUEST",
        );
        assert.ok(
          (invalid.data as { issues?: unknown[] }).issues?.length,
          "validation errors keep their field issues",
        );
        await rejectsWith(
          a.projects.update({ id: "not-a-uuid", name: "x" }),
          "BAD_REQUEST",
        );
        await rejectsWith(
          a.projects.update({
            id: projectId,
            name: "x",
            // @ts-expect-error the client type already forbids other hosts
            instagramApiHost: "evil.example",
          }),
          "BAD_REQUEST",
        );
        await rejectsWith(a.projects.create({ name: "   " }), "BAD_REQUEST");
        await rejectsWith(
          a.projects.create({ name: "x".repeat(121) }),
          "BAD_REQUEST",
        );
      });
      await t.test(
        "disconnectChannel checks project and provider",
        async () => {
          await a.projects.disconnectChannel({
            id: projectId,
            provider: "facebook",
          });
          await rejectsWith(
            b.projects.disconnectChannel({
              id: projectId,
              provider: "facebook",
            }),
            "NOT_FOUND",
          );
          await rejectsWith(
            a.projects.disconnectChannel({
              id: projectId,
              // @ts-expect-error the client type only allows known networks
              provider: "myspace",
            }),
            "BAD_REQUEST",
          );
        },
      );
      await t.test(
        "delete keeps deletion errors and their messages",
        async () => {
          const wrongName = await rejectsWith(
            a.projects.delete({ id: projectId, confirmation: "Wrong name" }),
            "BAD_REQUEST",
          );
          assert.match(wrongName.message, /project name exactly/);
          await rejectsWith(
            b.projects.delete({ id: projectId, confirmation: "Renamed brand" }),
            "NOT_FOUND",
          );
          assert.ok((await a.projects.list()).some((p) => p.id === projectId));
        },
      );
      await t.test("delete removes the project for its owner", async () => {
        await a.projects.delete({
          id: projectId,
          confirmation: "Renamed brand",
        });
        assert.ok(!(await a.projects.list()).some((p) => p.id === projectId));
      });
    } finally {
      try {
        await users.cleanup();
      } finally {
        await closeDb();
      }
    }
  },
);
