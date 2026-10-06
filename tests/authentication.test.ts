import sharp from "sharp";
import { GET as previewImage } from "../src/app/api/posts/[id]/image/route";
import { removeImage, publicationImageUrl } from "../src/lib/storage";
import { getPostImage, storedAssets } from "../src/lib/store";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { users, accounts, posts, projects, sessions } from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import {
  GET as listProjects,
  POST as createProject,
} from "../src/app/api/projects/route";
import { PATCH as updateProject } from "../src/app/api/projects/[id]/route";
import { POST as rotateToken } from "../src/app/api/projects/[id]/token/route";
import {
  GET as listPosts,
  POST as createPost,
} from "../src/app/api/posts/route";
import {
  PATCH as editPost,
  DELETE as deletePost,
} from "../src/app/api/posts/[id]/route";
import { POST as publishPost } from "../src/app/api/posts/[id]/publish/route";
import { GET as connections } from "../src/app/api/connections/route";
import { handleProjectMcp } from "../src/lib/mcp";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const createdUsers: string[] = [];
const origin = process.env.APP_URL || "http://localhost:8200";
function request(path: string, method = "GET", cookie = "", body?: unknown) {
  return new Request(origin + path, {
    method,
    headers: { origin, cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
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
        return { id: data.user.id, email, cookie: cookies(response) };
      };
      const a = await signup(),
        b = await signup();
      await t.test(
        "signup creates hashed credentials and a usable session without verification",
        async () => {
          const [user] = await getDb()
            .select()
            .from(users)
            .where(eq(users.id, a.id));
          assert.equal(user.emailVerified, false);
          const [account] = await getDb()
            .select()
            .from(accounts)
            .where(eq(accounts.userId, a.id));
          assert.equal(account.providerId, "credential");
          assert.ok(account.password && account.password !== password);
          assert.equal(
            (await listProjects(request("/api/projects", "GET", a.cookie)))
              .status,
            200,
          );
          assert.equal(
            (await listProjects(request("/api/projects"))).status,
            401,
          );
          assert.equal(
            (
              await listProjects(
                request(
                  "/api/projects",
                  "GET",
                  "better-auth.session_token=forged",
                ),
              )
            ).status,
            401,
          );
        },
      );
      const aProjects = await (
        await listProjects(request("/api/projects", "GET", a.cookie))
      ).json();
      const bProjects = await (
        await listProjects(request("/api/projects", "GET", b.cookie))
      ).json();
      const aId = aProjects[0].id;
      const bId = bProjects[0].id;
      assert.notEqual(aId, bId);
      const newProjectResponse = await createProject(
        request("/api/projects", "POST", a.cookie, {
          name: "Extra project",
          userId: b.id,
        }),
      );
      assert.equal(newProjectResponse.status, 201);
      const extra = await newProjectResponse.json();
      await t.test(
        "users can own multiple projects and cannot see other users",
        async () => {
          assert.equal(
            (
              await (
                await listProjects(request("/api/projects", "GET", a.cookie))
              ).json()
            ).length,
            2,
          );
          assert.equal(
            (
              await (
                await listProjects(request("/api/projects", "GET", b.cookie))
              ).json()
            ).length,
            1,
          );
          const [row] = await getDb()
            .select()
            .from(projects)
            .where(eq(projects.id, extra.project.id));
          assert.equal(row.userId, a.id);
          assert.equal(
            (
              await updateProject(
                request(`/api/projects/${aId}`, "PATCH", b.cookie, {
                  name: "Intrusion",
                }),
                { params: Promise.resolve({ id: aId }) },
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await rotateToken(
                request(`/api/projects/${aId}/token`, "POST", b.cookie),
                { params: Promise.resolve({ id: aId }) },
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await connections(
                request(`/api/connections?projectId=${aId}`, "GET", b.cookie),
              )
            ).status,
            404,
          );
        },
      );
      const draftResponse = await createPost(
        request(`/api/posts?projectId=${aId}`, "POST", a.cookie, {
          title: "Private test",
          caption: "Private test content",
          platforms: ["facebook"],
        }),
      );
      assert.equal(draftResponse.status, 201);
      const draft = await draftResponse.json();
      await t.test(
        "all post operations require project ownership",
        async () => {
          assert.equal(
            (
              await listPosts(
                request(`/api/posts?projectId=${aId}`, "GET", b.cookie),
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await createPost(
                request(`/api/posts?projectId=${aId}`, "POST", b.cookie, {
                  title: "Intrusion",
                  caption: "test",
                  platforms: ["facebook"],
                }),
              )
            ).status,
            404,
          );
          const ctx = { params: Promise.resolve({ id: draft.id }) };
          assert.equal(
            (
              await editPost(
                request(
                  `/api/posts/${draft.id}?projectId=${aId}`,
                  "PATCH",
                  b.cookie,
                  {
                    title: "Intrusion",
                    caption: "test",
                    platforms: ["facebook"],
                  },
                ),
                ctx,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await deletePost(
                request(
                  `/api/posts/${draft.id}?projectId=${aId}`,
                  "DELETE",
                  b.cookie,
                ),
                ctx,
              )
            ).status,
            404,
          );
          assert.equal(
            (
              await publishPost(
                request(
                  `/api/posts/${draft.id}/publish?projectId=${aId}`,
                  "POST",
                  b.cookie,
                ),
                ctx,
              )
            ).status,
            404,
          );
        },
      );
      await t.test(
        "MCP still works with scoped tokens without a browser session",
        async () => {
          const req = new Request(origin + `/api/mcp/${extra.project.id}`, {
            method: "POST",
            headers: {
              authorization: `Bearer ${extra.mcpToken}`,
              "Content-Type": "application/json",
              accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "tools/call",
              params: { name: "get_project", arguments: {} },
            }),
          });
          const response = await handleProjectMcp(req, extra.project.id);
          assert.equal(response.status, 200);
          const data = await response.json();
          assert.equal(
            JSON.parse(data.result.content[0].text).id,
            extra.project.id,
          );
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
            const r = await handleProjectMcp(
              new Request(origin + `/api/mcp/${extra.project.id}`, {
                method: "POST",
                headers: {
                  authorization: `Bearer ${extra.mcpToken}`,
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
                      title: "Image test",
                      caption: "Image test",
                      platforms: ["instagram"],
                      ...args,
                    },
                  },
                }),
              }),
              extra.project.id,
            );
            const data = await r.json();
            assert.ok(
              !data.error && !data.result.isError,
              JSON.stringify(data),
            );
            return JSON.parse(data.result.content[0].text);
          }
          const toolResponse = await handleProjectMcp(
            new Request(origin + `/api/mcp/${extra.project.id}`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${extra.mcpToken}`,
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
            extra.project.id,
          );
          const tools = (await toolResponse.json()).result.tools;
          const mainTool = tools.find(
            (tool: { name: string }) => tool.name === "create_draft",
          );
          assert.ok(mainTool.inputSchema.properties.image);
          for (const removed of ["imageUrl", "imageFile", "imageUploadId"])
            assert.ok(!(removed in mainTool.inputSchema.properties));
          assert.equal(mainTool._meta.securitySchemes[0].type, "oauth2");
          const fileTool = tools.find(
            (tool: { name: string }) => tool.name === "create_draft_from_file",
          );
          assert.deepEqual(fileTool._meta["openai/fileParams"], ["image"]);
          const hostSchema = fileTool.inputSchema.properties.image;
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
            image: {
              type: "INLINE_BASE64",
              dataBase64: jpeg.toString("base64"),
              filename: "test.jpg",
            },
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
          const row = await getPostImage(extra.project.id, post.id);
          assert.ok(row.imageKey && row.imageBucket);
          const signed = await publicationImageUrl({
            imageKey: row.imageKey!,
            imageBucket: row.imageBucket!,
          });
          assert.equal((await fetch(signed)).status, 200);
          const unsigned = new URL(signed);
          unsigned.search = "";
          assert.ok(
            [401, 403].includes((await fetch(unsigned)).status),
            "Bucket must remain private",
          );
          const imported = await mcpImage({
            image: { type: "EXTERNAL_URL", url: signed },
          });
          assert.notEqual(
            (await getPostImage(extra.project.id, imported.id)).imageKey,
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
            image: {
              type: "OPENAPI_FILE",
              download_url: signed,
              file_id: "file_test",
              mime_type: "image/jpeg",
              file_name: "test.jpg",
            },
          });
          assert.match(openapi.imageUrl, /^\/api\/posts\//);
          assert.ok(!JSON.stringify(openapi).includes("file_test"));
          const fileResponse = await handleProjectMcp(
            new Request(origin + `/api/mcp/${extra.project.id}`, {
              method: "POST",
              headers: {
                authorization: `Bearer ${extra.mcpToken}`,
                "Content-Type": "application/json",
                accept: "application/json, text/event-stream",
              },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: {
                  name: "create_draft_from_file",
                  arguments: {
                    title: "ChatGPT file",
                    caption: "ChatGPT file",
                    platforms: ["instagram"],
                    image: {
                      download_url: signed,
                      file_id: "file_host",
                      mime_type: "image/jpeg",
                      file_name: "host.jpg",
                    },
                  },
                },
              }),
            }),
            extra.project.id,
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
          const kept = await editPost(
            request(
              `/api/posts/${post.id}?projectId=${extra.project.id}`,
              "PATCH",
              a.cookie,
              {
                title: "Edited",
                caption: "Edited",
                platforms: ["instagram"],
                keepImage: true,
              },
            ),
            ctx,
          );
          assert.equal(kept.status, 200);
          assert.equal(
            (await getPostImage(extra.project.id, post.id)).imageKey,
            row.imageKey,
          );
          assert.equal(
            (
              await deletePost(
                request(
                  `/api/posts/${post.id}?projectId=${extra.project.id}`,
                  "DELETE",
                  a.cookie,
                ),
                ctx,
              )
            ).status,
            200,
          );
          assert.equal((await fetch(signed)).status, 404);
        },
      );
      await t.test(
        "signin rejects incorrect passwords and signout invalidates sessions",
        async () => {
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
          assert.equal(
            (await listProjects(request("/api/projects", "GET", expiredCookie)))
              .status,
            401,
          );
          response = await getAuth().handler(
            request("/api/auth/sign-in/email", "POST", "", {
              email: a.email,
              password,
            }),
          );
          assert.equal(response.status, 200);
          const cookie = cookies(response);
          assert.equal(
            (await listProjects(request("/api/projects", "GET", cookie)))
              .status,
            200,
          );
          response = await getAuth().handler(
            request("/api/auth/sign-out", "POST", cookie, {}),
          );
          assert.equal(response.status, 200);
          assert.equal(
            (await listProjects(request("/api/projects", "GET", cookie)))
              .status,
            401,
          );
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
