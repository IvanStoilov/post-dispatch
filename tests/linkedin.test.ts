import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { projects, users, verifications } from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import {
  createProject,
  getProject,
  listProjects,
  saveConnector,
  disconnectConnector,
  isConnected,
} from "../src/lib/projects";
import {
  startConnection,
  callbackConnection,
  availableLinkedInAccounts,
  selectLinkedInAccount,
} from "../src/lib/connector-connect";
import {
  publishLinkedIn,
  linkedinUploadUrl,
} from "../src/lib/connectors/linkedin";
import { mcpDraftSchema, filesDraftSchema } from "../src/lib/mcp-images";
import { createPost, deletePost } from "../src/lib/store";
import { publishPost } from "../src/lib/publishing";
import type { Post } from "../src/lib/types";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test("MCP accepts LinkedIn in both multi-asset tools and rejects unsupported channels", () => {
  const input = { title: "Example", caption: "Hello", platforms: ["linkedin"] };
  assert.ok(mcpDraftSchema.safeParse(input).success);
  assert.ok(
    mcpDraftSchema.safeParse({
      ...input,
      platforms: ["facebook", "instagram", "linkedin"],
    }).success,
  );
  assert.ok(
    filesDraftSchema.safeParse({
      ...input,
      assets: [
        { download_url: "https://example.com/image.jpg", file_id: "file-test" },
      ],
    }).success,
  );
  assert.ok(
    !mcpDraftSchema.safeParse({ ...input, platforms: ["unknown"] }).success,
  );
});
test("LinkedIn upload destinations reject credential exfiltration", () => {
  assert.ok(
    linkedinUploadUrl("https://www.linkedin.com/dms-uploads/a?signed=1"),
  );
  for (const url of [
    "http://www.linkedin.com/a",
    "https://linkedin.com.evil.test/a",
    "https://user:password@www.linkedin.com/a",
    "https://localhost/a",
  ])
    assert.throws(() => linkedinUploadUrl(url));
});
test(
  "LinkedIn OAuth chooses authorized profiles/companies, isolates projects, and publishes through the registry",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const envKeys = [
      "LINKEDIN_CLIENT_ID",
      "LINKEDIN_CLIENT_SECRET",
      "LINKEDIN_ORGANIZATION_POSTING",
    ];
    const env = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
    process.env.LINKEDIN_CLIENT_ID = "test-client";
    process.env.LINKEDIN_CLIENT_SECRET = "test-secret";
    process.env.LINKEDIN_ORGANIZATION_POSTING = "true";
    const original = globalThis.fetch;
    const origin = process.env.APP_URL || "http://localhost:8200";
    let userId = "",
      otherId = "",
      postId = "";
    const projectIds: string[] = [];
    const pendingIds: string[] = [];
    const cookie = (r: Response) =>
      r.headers
        .getSetCookie()
        .map((s) => s.split(";")[0])
        .join("; ");
    const request = (path: string, cookies: string, body?: unknown) =>
      new Request(origin + path, {
        method: body ? "POST" : "GET",
        headers: {
          cookie: cookies,
          origin,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      const signup = await getAuth().handler(
        request("/api/auth/sign-up/email", "", {
          name: "LinkedIn test",
          email: `li-${randomUUID()}@example.test`,
          password: `Password-${randomUUID()}`,
        }),
      );
      assert.equal(signup.status, 200);
      userId = (await signup.json()).user.id;
      const sessionCookie = cookie(signup);
      otherId = randomUUID();
      await getDb()
        .insert(users)
        .values({
          id: otherId,
          name: "Other user",
          email: `${otherId}@example.test`,
        });
      const first = await createProject(userId, { name: "LinkedIn test" });
      const second = await createProject(otherId, { name: "Other project" });
      projectIds.push(first.project.id, second.project.id);
      await assert.rejects(() =>
        startConnection(
          request("/api/connectors/linkedin/start", sessionCookie, {
            projectId: second.project.id,
          }),
          "linkedin",
        ),
      );
      const begin = await startConnection(
        request("/api/connectors/linkedin/start", sessionCookie, {
          projectId: first.project.id,
        }),
        "linkedin",
      );
      const authorization = new URL((await begin.json()).url);
      assert.equal(authorization.origin, "https://www.linkedin.com");
      assert.ok(
        authorization.searchParams
          .get("scope")
          ?.includes("w_organization_social"),
      );
      const state = authorization.searchParams.get("state")!;
      pendingIds.push(state);
      const flowCookie = `${sessionCookie}; ${cookie(begin)}`;
      const callbackPath = `/api/connectors/linkedin/callback?state=${state}&code=test-code`;
      await assert.rejects(
        () =>
          callbackConnection(
            request(callbackPath.replace(state, "invalid"), flowCookie),
            "linkedin",
          ),
        /state/,
      );
      let posts = 0;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.includes("oauth/v2/accessToken"))
          return Response.json({
            access_token: "private-linkedin-token",
            expires_in: 3600,
            scope:
              "openid profile w_member_social w_organization_social rw_organization_admin",
          });
        if (url.includes("/v2/userinfo"))
          return Response.json({ sub: "member123", name: "Test Member" });
        if (url.includes("/rest/organizationAcls"))
          return Response.json({
            elements: [
              {
                state: "APPROVED",
                role: "ADMINISTRATOR",
                organizationTarget: "urn:li:organization:123",
              },
              {
                state: "APPROVED",
                role: "ANALYST",
                organizationTarget: "urn:li:organization:456",
              },
            ],
            paging: { links: [] },
          });
        if (url.includes("/rest/organizations/123"))
          return Response.json({ localizedName: "Test Company" });
        if (url.endsWith("/rest/posts")) {
          posts++;
          const payload = JSON.parse(String(init?.body));
          assert.ok(
            ["urn:li:person:member123", "urn:li:organization:123"].includes(
              payload.author,
            ),
          );
          return new Response(null, {
            status: 201,
            headers: { "x-restli-id": "urn:li:share:123" },
          });
        }
        throw new Error(`Unexpected request ${url}`);
      };
      const callback = await callbackConnection(
        request(callbackPath, flowCookie),
        "linkedin",
      );
      assert.equal(callback.status, 303);
      assert.ok(
        callback.headers.get("location")?.endsWith("/connections/linkedin"),
      );
      await assert.rejects(
        () => callbackConnection(request(callbackPath, flowCookie), "linkedin"),
        /expired/,
      );
      pendingIds.push(cookie(callback).split("=")[1]);
      const selectionCookie = `${sessionCookie}; ${cookie(callback)}`;
      const options = await (
        await availableLinkedInAccounts(
          request("/api/connectors/linkedin/accounts", selectionCookie),
        )
      ).json();
      assert.equal(options.pages.length, 2);
      assert.ok(!JSON.stringify(options).includes("private-linkedin-token"));
      await assert.rejects(
        () =>
          selectLinkedInAccount(
            request("/api/connectors/linkedin/accounts", selectionCookie, {
              pageId: "urn:li:organization:456",
            }),
          ),
        /authorized/,
      );
      await selectLinkedInAccount(
        request("/api/connectors/linkedin/accounts", selectionCookie, {
          pageId: "urn:li:organization:123",
        }),
      );
      await assert.rejects(
        () =>
          selectLinkedInAccount(
            request("/api/connectors/linkedin/accounts", selectionCookie, {
              pageId: "urn:li:organization:123",
            }),
          ),
        /expired/,
      );
      let project = await getProject(first.project.id);
      const connection = project.connections.find(
        (c) => c.provider === "linkedin",
      )!;
      assert.ok(isConnected(connection));
      assert.equal(connection.accountId, "urn:li:organization:123");
      assert.ok(
        !JSON.stringify(await listProjects(userId)).includes(
          "private-linkedin-token",
        ),
      );
      await assert.rejects(() =>
        disconnectConnector(otherId, first.project.id, "linkedin"),
      );
      const draft = await createPost(first.project.id, {
        title: "LinkedIn draft",
        caption: "Hello LinkedIn",
        platforms: ["linkedin"],
      });
      postId = draft.id;
      await publishPost(first.project.id, draft.id);
      assert.equal(posts, 1);
      await assert.rejects(
        () => publishPost(first.project.id, draft.id),
        /already/,
      );
      const post: Post = { ...draft, caption: "Personal profile test" };
      await publishLinkedIn({
        connection: { ...connection, accountId: "urn:li:person:member123" },
        post,
        assets: [],
        urls: [],
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(posts, 2);
      await saveConnector(userId, first.project.id, {
        provider: "linkedin",
        accountId: connection.accountId,
        accessToken: "expired",
        expiresAt: new Date(Date.now() - 1000),
      });
      project = await getProject(first.project.id);
      assert.ok(!isConnected(project.connections[0]));
      await disconnectConnector(userId, first.project.id, "linkedin");
      assert.equal((await getProject(first.project.id)).connections.length, 0);
    } finally {
      globalThis.fetch = original;
      for (const k of envKeys) {
        if (env[k] === undefined) delete process.env[k];
        else process.env[k] = env[k];
      }
      if (postId) await deletePost(projectIds[0], postId);
      if (projectIds.length)
        await getDb().delete(projects).where(inArray(projects.id, projectIds));
      const ids = [userId, otherId].filter(Boolean);
      if (ids.length) {
        await getDb().delete(projects).where(inArray(projects.userId, ids));
        if (pendingIds.length)
          await getDb()
            .delete(verifications)
            .where(
              inArray(
                verifications.identifier,
                pendingIds.map(
                  (n) =>
                    `meta-connect:${createHash("sha256").update(n).digest("hex")}`,
                ),
              ),
            );
        await getDb().delete(users).where(inArray(users.id, ids));
      }
      await closeDb();
    }
  },
);

test("LinkedIn media uploads preserve multipart boundaries and publishable IDs", async () => {
  const { uploadLinkedInAsset } =
    await import("../src/lib/connectors/linkedin");
  const original = globalThis.fetch;
  let parts = 0;
  const owner = "urn:li:person:test";
  const signal = AbortSignal.timeout(10000);
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("images?action=initializeUpload")) {
        assert.equal(
          JSON.parse(String(init?.body)).initializeUploadRequest.owner,
          owner,
        );
        return Response.json({
          value: {
            image: "urn:li:image:1",
            uploadUrl: "https://www.linkedin.com/image-upload",
          },
        });
      }
      if (url.endsWith("image-upload")) {
        assert.deepEqual(
          Buffer.from(init!.body as Uint8Array),
          Buffer.from([1, 2, 3, 4]),
        );
        return new Response(null, { status: 201 });
      }
      if (url.includes("videos?action=initializeUpload"))
        return Response.json({
          value: {
            video: "urn:li:video:1",
            uploadToken: "",
            uploadInstructions: [
              {
                firstByte: 0,
                lastByte: 1,
                uploadUrl: "https://www.linkedin.com/part1",
              },
              {
                firstByte: 2,
                lastByte: 3,
                uploadUrl: "https://www.linkedin.com/part2",
              },
            ],
          },
        });
      if (/part[12]$/.test(url)) {
        parts++;
        assert.deepEqual(
          Buffer.from(init!.body as Uint8Array),
          parts === 1 ? Buffer.from([1, 2]) : Buffer.from([3, 4]),
        );
        return new Response(null, { headers: { etag: `"receipt${parts}"` } });
      }
      if (url.includes("videos?action=finalizeUpload")) {
        assert.deepEqual(
          JSON.parse(String(init?.body)).finalizeUploadRequest.uploadedPartIds,
          ["receipt1", "receipt2"],
        );
        return new Response(null, { status: 204 });
      }
      if (url.includes("/rest/videos/"))
        return Response.json({ status: "AVAILABLE" });
      throw new Error("Unexpected LinkedIn request");
    };
    assert.equal(
      await uploadLinkedInAsset(
        owner,
        "secret",
        new Uint8Array([1, 2, 3, 4]),
        "IMAGE",
        signal,
      ),
      "urn:li:image:1",
    );
    assert.equal(
      await uploadLinkedInAsset(
        owner,
        "secret",
        new Uint8Array([1, 2, 3, 4]),
        "VIDEO",
        signal,
      ),
      "urn:li:video:1",
    );
    assert.equal(parts, 2);
    globalThis.fetch = async () =>
      Response.json({
        value: {
          video: "urn:li:video:2",
          uploadToken: "",
          uploadInstructions: [
            {
              firstByte: 1,
              lastByte: 4,
              uploadUrl: "https://www.linkedin.com/part1",
            },
          ],
        },
      });
    await assert.rejects(
      () =>
        uploadLinkedInAsset(
          owner,
          "secret",
          new Uint8Array([1, 2, 3, 4]),
          "VIDEO",
          signal,
        ),
      /ranges/,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("LinkedIn plain captions escape reserved markup without losing punctuation", async () => {
  const { escapeLinkedInText } = await import("../src/lib/connectors/linkedin");
  assert.equal(
    escapeLinkedInText("Hello (world) @team #launch"),
    "Hello \\(world\\) \\@team \\#launch",
  );
  assert.equal(
    escapeLinkedInText("Unicode: café 🚀\nNext line"),
    "Unicode: café 🚀\nNext line",
  );
});
