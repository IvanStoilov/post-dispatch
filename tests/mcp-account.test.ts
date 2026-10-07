import { POST as uploadRoute } from "../src/app/api/mcp/uploads/route";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { users, projects, posts, uploadTokens } from "../src/db/schema";
import { createProject } from "../src/lib/projects";
import { rotateAccountToken, verifyAccountToken } from "../src/lib/mcp-account";
import { handleAccountMcp } from "../src/lib/mcp";
import { accountResource } from "../src/lib/oauth-provider";
import { POST as rotateRoute } from "../src/app/api/mcp-settings/token/route";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
test(
  "account MCP project selection, isolation, and token lifecycle",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const owner = randomUUID(),
      other = randomUUID();
    const ids: string[] = [];
    async function call(
      token: string,
      name: string,
      args: Record<string, unknown> = {},
    ) {
      const response = await handleAccountMcp(
        new Request(accountResource(), {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
      );
      const body = await response.json();
      return {
        status: response.status,
        result: body.result,
        value:
          body.result && !body.result.isError
            ? JSON.parse(body.result.content[0].text)
            : null,
      };
    }
    try {
      await getDb()
        .insert(users)
        .values(
          [owner, other].map((id) => ({
            id,
            name: "MCP isolation test",
            email: `${id}@example.test`,
          })),
        );
      const bearer = (await rotateAccountToken(owner)).mcpToken;
      await t.test(
        "zero projects produces an actionable error and an empty list",
        async () => {
          assert.deepEqual((await call(bearer, "list_projects")).value, []);
          assert.match(
            (await call(bearer, "get_project")).result.content[0].text,
            /No projects/,
          );
        },
      );
      const first = (await createProject(owner, { name: "Brand A" })).project;
      ids.push(first.id);
      const foreign = (await createProject(other, { name: "Foreign brand" }))
        .project;
      ids.push(foreign.id);
      const draft = {
        title: "Account draft",
        caption: "A draft for review",
        platforms: ["facebook"],
      };
      await t.test(
        "a sole owned project is selected despite another account's projects",
        async () => {
          assert.equal((await call(bearer, "get_project")).value.id, first.id);
          const saved = await call(bearer, "create_draft", draft);
          assert.equal(saved.value.projectId, first.id);
          assert.ok(saved.value.reviewUrl.includes(`projectId=${first.id}`));
          assert.equal((await call(bearer, "list_posts")).value.length, 1);
          const upload = await call(bearer, "create_upload_token");
          assert.ok(upload.value.uploadUrl.includes(`projectId=${first.id}`));
        },
      );
      const second = (await createProject(owner, { name: "Brand B" })).project;
      ids.push(second.id);
      const tools: Record<string, Record<string, unknown>> = {
        get_project: {},
        list_posts: {},
        create_draft: draft,
        create_draft_from_files: {
          ...draft,
          assets: [
            {
              download_url: "https://example.test/media.png",
              file_id: "file_test",
            },
          ],
        },
        create_asset_upload: { mimeType: "image/jpeg", fileSize: 100 },
        complete_asset_upload: {
          uploadId: randomUUID(),
          completionToken: "test",
        },
        create_upload_token: {},
      };
      await t.test(
        "all project tools require an ID immediately after a second project is added",
        async () => {
          for (const [name, args] of Object.entries(tools)) {
            const response = await call(bearer, name, args);
            assert.equal(response.result.isError, true, name);
            assert.match(
              response.result.content[0].text,
              /projectId is required/,
              name,
            );
          }
          const list = await call(bearer, "list_projects");
          assert.deepEqual(
            list.value.map((p: { id: string }) => p.id).sort(),
            [first.id, second.id].sort(),
          );
          assert.equal(JSON.stringify(list.value).includes("token"), false);
        },
      );
      await t.test(
        "foreign project IDs fail for every tool before media fetching or upload allocation",
        async () => {
          for (const [name, args] of Object.entries(tools)) {
            const response = await call(bearer, name, {
              ...args,
              projectId: foreign.id,
            });
            assert.equal(response.result.isError, true, name);
            assert.match(
              response.result.content[0].text,
              /Project not found/,
              name,
            );
          }
          assert.equal(
            (
              await getDb()
                .select()
                .from(posts)
                .where(eq(posts.projectId, foreign.id))
            ).length,
            0,
          );
          assert.equal(
            (
              await getDb()
                .select()
                .from(uploadTokens)
                .where(eq(uploadTokens.projectId, foreign.id))
            ).length,
            0,
          );
        },
      );
      await t.test(
        "explicit destinations route drafts and reads independently",
        async () => {
          const saved = await call(bearer, "create_draft", {
            ...draft,
            projectId: second.id,
          });
          assert.equal(saved.value.projectId, second.id);
          assert.equal(
            (await call(bearer, "get_project", { projectId: first.id })).value
              .id,
            first.id,
          );
          const firstPosts = (
            await call(bearer, "list_posts", { projectId: first.id })
          ).value;
          assert.equal(
            firstPosts.some((p: { id: string }) => p.id === saved.value.id),
            false,
          );
          assert.equal(
            (await call(bearer, "list_posts", { projectId: second.id }))
              .value[0].id,
            saved.value.id,
          );
        },
      );
      await t.test(
        "rotation revokes the old account token and anonymous rotation is rejected",
        async () => {
          assert.equal(await verifyAccountToken(`Bearer ${bearer}`), owner);
          const replacement = (await rotateAccountToken(owner)).mcpToken;
          assert.equal((await call(bearer, "list_projects")).status, 401);
          assert.equal((await call(replacement, "list_projects")).status, 200);
          assert.equal(
            (
              await rotateRoute(
                new Request(accountResource() + "-settings/token", {
                  method: "POST",
                }),
              )
            ).status,
            401,
          );
        },
      );
    } finally {
      if (ids.length) {
        await getDb().delete(posts).where(inArray(posts.projectId, ids));
        await getDb()
          .delete(uploadTokens)
          .where(inArray(uploadTokens.projectId, ids));
        await getDb().delete(projects).where(inArray(projects.id, ids));
      }
      await getDb()
        .delete(users)
        .where(inArray(users.id, [owner, other]));
      await closeDb();
    }
  },
);

test("raw upload endpoint requires a valid explicit projectId", async () => {
  for (const suffix of ["", "?projectId=invalid"]) {
    const response = await uploadRoute(
      new Request(accountResource() + "/uploads" + suffix, { method: "POST" }),
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /projectId/);
  }
});
