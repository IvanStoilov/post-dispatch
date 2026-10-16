import { acceptedSignup } from "./helpers/terms";
import sharp from "sharp";
import { GET as previewImage } from "../src/app/api/posts/[id]/image/route";
import { removeImage, getAssetUrl } from "../src/lib/storage";
import { getPostImage, storedAssets } from "../src/lib/store";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { users, accounts, posts, projects, sessions } from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { assistantsService } from "../src/domain/assistants";
import { handleMcpRequest } from "../src/server/mcp";
import { serveRemoteFiles } from "./helpers/remote-files";
import { storageRequest } from "./helpers/storage";
import { client, rejectsWith } from "./helpers/orpc";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const createdUsers: string[] = [];
const origin = process.env.APP_URL || "http://localhost:8200";
function request(path: string, method = "GET", cookie = "", body?: unknown) {
  return new Request(origin + path, {
    method,
    headers: { origin, cookie, "Content-Type": "application/json" },
    body: body
      ? JSON.stringify(
          path.endsWith("/sign-up/email") ? acceptedSignup(body) : body,
        )
      : undefined,
  });
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
test(
  "password authentication and user ownership",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    try {
      const password = "Test-only-password-" + randomUUID();
      const signup = async () => {
        const email = randomUUID() + "@example.test";
        const response = await getAuth().handler(
          request("/api/auth/sign-up/email", "POST", "", {
            name: "Auth test",
            email,
            password,
          }),
        );
        assert.equal(
          response.status,
          200,
          JSON.stringify(await response.clone().json()),
        );
        const data = await response.json();
        createdUsers.push(data.user.id);
        // Email verification is required, so signup alone gives no session.
        assert.equal(data.token, null);
        assert.equal(cookies(response), "");
        const [user] = await getDb()
          .select()
          .from(users)
          .where(eq(users.id, data.user.id));
        assert.equal(user.emailVerified, false);
        await getDb()
          .update(users)
          .set({ emailVerified: true })
          .where(eq(users.id, data.user.id));
        const signin = await getAuth().handler(
          request("/api/auth/sign-in/email", "POST", "", { email, password }),
        );
        assert.equal(signin.status, 200);
        return { id: data.user.id, email, cookie: cookies(signin) };
      };
      const a = await signup(),
        b = await signup();
      await t.test(
        "signup creates hashed credentials and a usable session once verified",
        async () => {
          const [account] = await getDb()
            .select()
            .from(accounts)
            .where(eq(accounts.userId, a.id));
          assert.equal(account.providerId, "credential");
          assert.ok(account.password && account.password !== password);
          await client(a.cookie).projects.list();
          await rejectsWith(client().projects.list(), "UNAUTHORIZED");
          await rejectsWith(
            client("better-auth.session_token=forged").projects.list(),
            "UNAUTHORIZED",
          );
        },
      );
      await getDb()
        .insert(projects)
        .values([
          { userId: a.id, name: "Auth A" },
          { userId: b.id, name: "Auth B" },
        ]);
      const aProjects = await client(a.cookie).projects.list();
      const bProjects = await client(b.cookie).projects.list();
      const aId = aProjects[0].id;
      const bId = bProjects[0].id;
      assert.notEqual(aId, bId);
      // Ownership comes from the session, never from the request body.
      const extra = await client(a.cookie).projects.create({
        name: "Extra project",
        userId: b.id,
      } as { name: string });
      await t.test(
        "users can own multiple projects and cannot see other users",
        async () => {
          assert.equal((await client(a.cookie).projects.list()).length, 2);
          assert.equal((await client(b.cookie).projects.list()).length, 1);
          const [row] = await getDb()
            .select()
            .from(projects)
            .where(eq(projects.id, extra.id));
          assert.equal(row.userId, a.id);
          await rejectsWith(
            client(b.cookie).projects.update({ id: aId, name: "Intrusion" }),
            "NOT_FOUND",
          );
          await rejectsWith(client().assistants.rotateToken(), "UNAUTHORIZED");
        },
      );
      const draft = await client(a.cookie).posts.create({
        projectId: aId,
        title: "Private test",
        caption: "Private test content",
        platforms: ["facebook"],
      });
      await t.test(
        "all post operations require project ownership",
        async () => {
          const intruder = client(b.cookie);
          const fields = {
            title: "Intrusion",
            caption: "test",
            platforms: ["facebook" as const],
          };
          const ref = { projectId: aId, id: draft.id };
          await rejectsWith(
            intruder.posts.list({ projectId: aId }),
            "NOT_FOUND",
          );
          await rejectsWith(
            intruder.posts.create({ projectId: aId, ...fields }),
            "NOT_FOUND",
          );
          await rejectsWith(
            intruder.posts.update({ ...ref, ...fields }),
            "NOT_FOUND",
          );
          await rejectsWith(intruder.posts.delete(ref), "NOT_FOUND");
          await rejectsWith(intruder.publishing.publish(ref), "NOT_FOUND");
        },
      );
      const bearer = await assistantsService.rotateToken({ userId: a.id });
      await t.test(
        "MCP still works with scoped tokens without a browser session",
        async () => {
          const req = new Request(origin + "/api/mcp", {
            method: "POST",
            headers: {
              authorization: `Bearer ${bearer.mcpToken}`,
              "Content-Type": "application/json",
              accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: {
                name: "get_project",
                arguments: { projectId: extra.id },
              },
            }),
          });
          const response = await handleMcpRequest(req);
          assert.equal(response.status, 200);
          const data = await response.json();
          assert.equal(JSON.parse(data.result.content[0].text).id, extra.id);
        },
      );
      await t.test(
        "MCP files and URLs are stored privately, with owner-only previews",
        async () => {
          const jpeg = await sharp({
            create: {
              width: 320,
              height: 320,
              channels: 3,
              background: "#88bb99",
            },
          })
            .jpeg()
            .toBuffer();
          async function mcpImage(args: Record<string, unknown>) {
            const r = await handleMcpRequest(
              new Request(origin + "/api/mcp", {
                method: "POST",
                headers: {
                  authorization: `Bearer ${bearer.mcpToken}`,
                  "Content-Type": "application/json",
                  accept: "application/json, text/event-stream",
                },
                body: JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "tools/call",
                  params: {
                    name: "create_draft",
                    arguments: {
                      projectId: extra.id,
                      title: "Image test",
                      caption: "Image test",
                      platforms: ["instagram"],
                      ...args,
                    },
                  },
                }),
              }),
            );
            const data = await r.json();
            assert.ok(
              !data.error && !data.result.isError,
              JSON.stringify(data),
            );
            return JSON.parse(data.result.content[0].text);
          }
          const toolResponse = await handleMcpRequest(
            new Request(origin + "/api/mcp", {
              method: "POST",
              headers: {
                authorization: `Bearer ${bearer.mcpToken}`,
                "Content-Type": "application/json",
                accept: "application/json, text/event-stream",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 4,
                method: "tools/list",
                params: {},
              }),
            }),
          );
          const tools = (await toolResponse.json()).result.tools;
          assert.ok(
            tools.every(
              (tool: { name: string }) =>
                !/publish|schedule|approve/.test(tool.name),
            ),
          );
          const mainTool = tools.find(
            (tool: { name: string }) => tool.name === "create_draft",
          );
          assert.equal(mainTool.inputSchema.properties.assets.type, "array");
          for (const removed of [
            "image",
            "imageUrl",
            "imageFile",
            "imageUploadId",
          ])
            assert.ok(!(removed in mainTool.inputSchema.properties));
          assert.equal(mainTool._meta.securitySchemes[0].type, "oauth2");
          const fileTool = tools.find(
            (tool: { name: string }) => tool.name === "create_draft_from_files",
          );
          assert.ok(
            !tools.some(
              (tool: { name: string }) =>
                tool.name === "create_draft_from_file",
            ),
          );
          assert.deepEqual(fileTool._meta["openai/fileParams"], ["assets"]);
          const hostSchema = fileTool.inputSchema.properties.assets.items;
          assert.deepEqual(hostSchema.required.sort(), [
            "download_url",
            "file_id",
          ]);
          for (const field of [
            "download_url",
            "file_id",
            "mime_type",
            "file_name",
          ])
            assert.ok(hostSchema.properties[field]);
          const post = await mcpImage({
            assets: [
              {
                type: "INLINE_BASE64",
                dataBase64: jpeg.toString("base64"),
                filename: "test.jpg",
              },
            ],
          });
          assert.match(post.imageUrl, /^\/api\/posts\//);
          assert.ok(!("imageKey" in post));
          const ctx = { params: Promise.resolve({ id: post.id }) };
          const own = await previewImage(
            request(post.imageUrl, "GET", a.cookie),
            ctx,
          );
          assert.equal(own.status, 200);
          assert.equal(own.headers.get("Content-Type"), "image/jpeg");
          assert.equal(own.headers.get("Cache-Control"), "private, no-store");
          assert.ok((await own.arrayBuffer()).byteLength > 0);
          assert.equal(
            (await previewImage(request(post.imageUrl), ctx)).status,
            401,
          );
          assert.equal(
            (await previewImage(request(post.imageUrl, "GET", b.cookie), ctx))
              .status,
            404,
          );
          assert.equal(
            (
              await previewImage(
                request(
                  `/api/posts/${post.id}/image?projectId=${aId}`,
                  "GET",
                  a.cookie,
                ),
                ctx,
              )
            ).status,
            404,
          );
          const row = await getPostImage(extra.id, post.id);
          assert.ok(row.imageKey && row.imageBucket);
          const signed = await getAssetUrl({
            storageProvider: row.storageProvider!,
            imageKey: row.imageKey!,
            imageBucket: row.imageBucket!,
          });
          const stored = await storageRequest(signed);
          assert.equal(stored.status, 200);
          // Stored media is only served by its exact object reference.
          const unsigned = new URL(signed);
          unsigned.search = "";
          assert.equal(
            (await storageRequest(unsigned.href)).status,
            404,
            "Stored media must not be served without its reference",
          );
          // Assistants import from public URLs; serve the stored bytes from
          // a fake public host so the real downloader runs.
          const remote = serveRemoteFiles();
          t.after(() => remote.restore());
          const external = remote.add(
            "/stored.jpg",
            Buffer.from(await stored.arrayBuffer()),
            "image/jpeg",
          );
          const imported = await mcpImage({
            assets: [{ type: "EXTERNAL_URL", url: external }],
          });
          assert.notEqual(
            (await getPostImage(extra.id, imported.id)).imageKey,
            row.imageKey,
          );
          assert.equal(
            (
              await previewImage(request(imported.imageUrl, "GET", a.cookie), {
                params: Promise.resolve({ id: imported.id }),
              })
            ).status,
            200,
          );
          const openapi = await mcpImage({
            assets: [
              {
                type: "OPENAPI_FILE",
                download_url: external,
                file_id: "file_test",
                mime_type: "image/jpeg",
                file_name: "test.jpg",
              },
            ],
          });
          assert.match(openapi.imageUrl, /^\/api\/posts\//);
          assert.ok(!JSON.stringify(openapi).includes("file_test"));
          const fileResponse = await handleMcpRequest(
            new Request(origin + "/api/mcp", {
              method: "POST",
              headers: {
                authorization: `Bearer ${bearer.mcpToken}`,
                "Content-Type": "application/json",
                accept: "application/json, text/event-stream",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: {
                  name: "create_draft_from_files",
                  arguments: {
                    projectId: extra.id,
                    title: "ChatGPT file",
                    caption: "ChatGPT file",
                    platforms: ["instagram"],
                    assets: [
                      {
                        download_url: external,
                        file_id: "file_host",
                        mime_type: "image/jpeg",
                        file_name: "host.jpg",
                      },
                    ],
                  },
                },
              }),
            }),
          );
          const fileResult = await fileResponse.json();
          assert.ok(!fileResult.result.isError, JSON.stringify(fileResult));
          const filePost = JSON.parse(fileResult.result.content[0].text);
          assert.equal(
            (
              await previewImage(request(filePost.imageUrl, "GET", a.cookie), {
                params: Promise.resolve({ id: filePost.id }),
              })
            ).status,
            200,
          );
          // Omitting assets keeps the post's media.
          await client(a.cookie).posts.update({
            projectId: extra.id,
            id: post.id,
            title: "Edited",
            caption: "Edited",
            platforms: ["instagram"],
          });
          assert.equal(
            (await getPostImage(extra.id, post.id)).imageKey,
            row.imageKey,
          );
          await client(a.cookie).posts.delete({
            projectId: extra.id,
            id: post.id,
          });
          assert.equal((await storageRequest(signed)).status, 404);
        },
      );
      await t.test(
        "signin rejects incorrect passwords and signout invalidates sessions",
        async (signinTest) => {
          // Fixture sign-ins share an IP. Advance beyond the library's 10-second
          // sign-in window while leaving production rate limits enabled.
          signinTest.mock.timers.enable({ apis: ["Date"], now: Date.now() });
          signinTest.mock.timers.tick(11000);
          let response = await getAuth().handler(
            request("/api/auth/sign-in/email", "POST", "", {
              email: a.email,
              password: "wrong-password",
            }),
          );
          assert.equal(response.status, 401);
          response = await getAuth().handler(
            request("/api/auth/sign-in/email", "POST", "", {
              email: a.email,
              password,
            }),
          );
          assert.equal(response.status, 200);
          const signedIn = await response.clone().json();
          const expiredCookie = cookies(response);
          await getDb()
            .update(sessions)
            .set({ expiresAt: new Date(Date.now() - 60000) })
            .where(eq(sessions.token, signedIn.token));
          await rejectsWith(
            client(expiredCookie).projects.list(),
            "UNAUTHORIZED",
          );
          response = await getAuth().handler(
            request("/api/auth/sign-in/email", "POST", "", {
              email: a.email,
              password,
            }),
          );
          assert.equal(response.status, 200);
          const cookie = cookies(response);
          await client(cookie).projects.list();
          response = await getAuth().handler(
            request("/api/auth/sign-out", "POST", cookie, {}),
          );
          assert.equal(response.status, 200);
          await rejectsWith(client(cookie).projects.list(), "UNAUTHORIZED");
        },
      );
    } finally {
      try {
        if (createdUsers.length) {
          const owned = await getDb()
            .select({ id: projects.id })
            .from(projects)
            .where(inArray(projects.userId, createdUsers));
          if (owned.length) {
            for (const row of await getDb()
              .select()
              .from(posts)
              .where(
                inArray(
                  posts.projectId,
                  owned.map((p) => p.id),
                ),
              ))
              for (const asset of storedAssets(
                await getPostImage(row.projectId, row.id),
              ))
                await removeImage(asset);
          }
          if (owned.length)
            await getDb()
              .delete(posts)
              .where(
                inArray(
                  posts.projectId,
                  owned.map((p) => p.id),
                ),
              );
          await getDb()
            .delete(projects)
            .where(inArray(projects.userId, createdUsers));
          await getDb().delete(users).where(inArray(users.id, createdUsers));
        }
      } finally {
        await closeDb();
      }
    }
  },
);
