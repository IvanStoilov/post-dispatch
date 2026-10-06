import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Writable } from "node:stream";
import winston from "winston";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { users, verifications, projects } from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { createProject, getProject } from "../src/lib/projects";
import {
  startConnection,
  callbackConnection,
  availablePages,
  selectPage,
  connectionError,
} from "../src/lib/meta-connect";
import { logger } from "../src/lib/logger";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const origin = process.env.APP_URL || "http://localhost:8200";
const cookie = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((item) => item.split(";")[0])
    .join("; ");
const req = (
  path: string,
  cookies: string,
  body?: unknown,
  requestOrigin = origin,
) =>
  new Request(origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      cookie: cookies,
      origin: requestOrigin,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test(
  "Meta customer connections bind sessions/projects, exchange tokens privately and resist replay",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const created: string[] = [];
    const originalFetch = globalThis.fetch;
    const credentials = [
      "FACEBOOK_APP_ID",
      "FACEBOOK_APP_SECRET",
      "INSTAGRAM_APP_ID",
      "INSTAGRAM_APP_SECRET",
    ];
    const saved = Object.fromEntries(
      credentials.map((key) => [key, process.env[key]]),
    );
    for (const key of credentials)
      process.env[key] = key.endsWith("SECRET") ? "test-app-secret" : "123456";
    const lines: string[] = [];
    const oldTransports = [...logger.transports];
    const oldLevel = logger.level;
    logger.clear();
    logger.level = "debug";
    logger.add(
      new winston.transports.Stream({
        stream: new Writable({
          write(chunk, _encoding, done) {
            lines.push(chunk.toString());
            done();
          },
        }),
      }),
    );
    const pendingIds: string[] = [];
    try {
      async function signup() {
        const response = await getAuth().handler(
          req("/api/auth/sign-up/email", "", {
            name: "Meta test",
            email: `meta-${randomUUID()}@example.test`,
            password: `Password-${randomUUID()}`,
          }),
        );
        assert.equal(response.status, 200);
        const user = (await response.json()).user;
        created.push(user.id);
        return { id: user.id, cookie: cookie(response) };
      }
      const a = await signup(),
        b = await signup();
      const first = await createProject(a.id, {
        name: "Customer A",
        facebookPageId: "original-page",
        facebookPageToken: "original-token",
      });
      const second = await createProject(b.id, { name: "Customer B" });
      async function begin(provider: "facebook" | "instagram") {
        const response = await startConnection(
          req(`/api/meta/${provider}/start`, a.cookie, {
            projectId: first.project.id,
          }),
          provider,
        );
        const url = new URL((await response.json()).url);
        const nonce = url.searchParams.get("state")!;
        pendingIds.push(
          `meta-connect:${(await import("node:crypto")).createHash("sha256").update(nonce).digest("hex")}`,
        );
        assert.ok(
          response.headers
            .get("Set-Cookie")
            ?.includes("HttpOnly; SameSite=Lax"),
        );
        assert.equal(
          url.searchParams.get("redirect_uri"),
          origin + `/api/meta/${provider}/callback`,
        );
        return { nonce, cookie: a.cookie + "; " + cookie(response), url };
      }
      let calls = 0;
      globalThis.fetch = async (input) => {
        calls++;
        const url = new URL(String(input));
        if (
          url.pathname.endsWith("/oauth/access_token") &&
          url.hostname === "graph.facebook.com"
        )
          return Response.json({
            access_token: url.searchParams.has("code")
              ? "fb-short-secret"
              : "fb-long-secret",
          });
        if (url.pathname.endsWith("/me/permissions"))
          return Response.json({
            data: [
              "pages_show_list",
              "pages_read_engagement",
              "pages_manage_posts",
            ].map((permission) => ({ permission, status: "granted" })),
          });
        if (url.pathname.endsWith("/me/accounts"))
          return Response.json({
            data: [
              {
                id: "page-one",
                name: "First Page",
                access_token: "page-secret-one",
                tasks: ["CREATE_CONTENT"],
              },
              {
                id: "page-two",
                name: "Second Page",
                access_token: "page-secret-two",
                tasks: ["MANAGE"],
              },
              {
                id: "readonly-page",
                name: "Read-only",
                access_token: "readonly-secret",
                tasks: ["ANALYZE"],
              },
            ],
          });
        if (url.hostname === "api.instagram.com")
          return Response.json({
            access_token: "ig-short-secret",
            permissions:
              "instagram_business_basic,instagram_business_content_publish",
          });
        if (url.pathname === "/access_token")
          return Response.json({
            access_token: "ig-long-secret",
            expires_in: 5184000,
          });
        if (
          url.hostname === "graph.instagram.com" &&
          url.pathname.endsWith("/me")
        )
          return Response.json({
            user_id: "instagram-user",
            username: "customer",
          });
        throw new Error("Unexpected URL: " + url.pathname);
      };
      await t.test(
        "authentication, ownership and same-origin are required",
        async () => {
          await assert.rejects(
            startConnection(
              req("/api/meta/facebook/start", "", {
                projectId: first.project.id,
              }),
              "facebook",
            ),
            /Sign in/,
          );
          await assert.rejects(
            startConnection(
              req("/api/meta/facebook/start", a.cookie, {
                projectId: second.project.id,
              }),
              "facebook",
            ),
            /not found/,
          );
          await assert.rejects(
            startConnection(
              req(
                "/api/meta/facebook/start",
                a.cookie,
                { projectId: first.project.id },
                "https://evil.example",
              ),
              "facebook",
            ),
            /origin/,
          );
          assert.equal(calls, 0);
        },
      );
      await t.test(
        "Facebook requires state and exact session; Page picker never returns tokens",
        async () => {
          const flow = await begin("facebook");
          const callback = `/api/meta/facebook/callback?state=${flow.nonce}&code=private-oauth-code`;
          await assert.rejects(
            callbackConnection(
              req(callback.replace(flow.nonce, "wrong"), flow.cookie),
              "facebook",
            ),
            /state/,
          );
          await assert.rejects(
            callbackConnection(
              req(callback, b.cookie + "; " + flow.cookie.split("; ").at(-1)),
              "facebook",
            ),
            /session/,
          );
          assert.equal(calls, 0);
          const response = await callbackConnection(
            req(callback, flow.cookie),
            "facebook",
          );
          assert.equal(response.status, 303);
          assert.equal(
            new URL(response.headers.get("Location")!).pathname,
            "/connections/facebook",
          );
          await assert.rejects(
            callbackConnection(req(callback, flow.cookie), "facebook"),
            /expired/,
          );
          const selectionCookies = a.cookie + "; " + cookie(response);
          const listed = await availablePages(
            req("/api/meta/facebook/pages", selectionCookies),
          );
          const listedText = await listed.text();
          assert.ok(!listedText.includes("secret"));
          assert.deepEqual(
            JSON.parse(listedText).pages.map((page: { id: string }) => page.id),
            ["page-one", "page-two"],
          );
          const selectionNonce = cookie(response).split("=")[1];
          const selectedIdentifier = `meta-connect:${createHash("sha256").update(selectionNonce).digest("hex")}`;
          pendingIds.push(selectedIdentifier);
          const rows = await getDb()
            .select()
            .from(verifications)
            .where(eq(verifications.identifier, selectedIdentifier));
          assert.equal(rows.length, 1);
          assert.ok(!JSON.stringify(rows).includes("page-secret"));
          await assert.rejects(
            selectPage(
              req("/api/meta/facebook/pages", selectionCookies, {
                pageId: "forged",
              }),
            ),
            /authorized list/,
          );
          const result = await selectPage(
            req("/api/meta/facebook/pages", selectionCookies, {
              pageId: "page-two",
            }),
          );
          assert.ok(!(await result.text()).includes("page-secret"));
          const project = await getProject(first.project.id);
          assert.equal(project.facebookPageId, "page-two");
          assert.equal(project.facebookPageToken, "page-secret-two");
          assert.equal(
            (await getProject(second.project.id)).facebookPageId,
            "",
          );
          await assert.rejects(
            selectPage(
              req("/api/meta/facebook/pages", selectionCookies, {
                pageId: "page-one",
              }),
            ),
            /expired/,
          );
        },
      );
      await t.test(
        "Instagram Login saves long-lived token and correct host without a Page",
        async () => {
          const flow = await begin("instagram");
          assert.equal(flow.url.hostname, "www.instagram.com");
          assert.equal(flow.url.searchParams.get("enable_fb_login"), "0");
          const response = await callbackConnection(
            req(
              `/api/meta/instagram/callback?state=${flow.nonce}&code=private-oauth-code`,
              flow.cookie,
            ),
            "instagram",
          );
          assert.equal(response.status, 303);
          const project = await getProject(first.project.id);
          assert.equal(project.instagramAccountId, "instagram-user");
          assert.equal(project.instagramAccessToken, "ig-long-secret");
          assert.equal(project.instagramApiHost, "graph.instagram.com");
          assert.equal(project.facebookPageId, "page-two");
        },
      );
      await t.test(
        "cancellation, expiration and Meta failures preserve saved credentials",
        async () => {
          const flow = await begin("instagram");
          const before = calls;
          const cancelled = await callbackConnection(
            req(
              `/api/meta/instagram/callback?state=${flow.nonce}&error=access_denied`,
              flow.cookie,
            ),
            "instagram",
          );
          assert.ok(
            cancelled.headers.get("Location")?.includes("connection=cancelled"),
          );
          assert.equal(calls, before);
          const expired = await begin("instagram");
          await getDb()
            .update(verifications)
            .set({ expiresAt: new Date(0) })
            .where(eq(verifications.identifier, pendingIds.at(-1)!));
          await assert.rejects(
            callbackConnection(
              req(
                `/api/meta/instagram/callback?state=${expired.nonce}&code=test`,
                expired.cookie,
              ),
              "instagram",
            ),
            /expired/,
          );
          const failing = await begin("instagram");
          globalThis.fetch = async () =>
            Response.json(
              { error: { message: "secret-provider-error test-app-secret" } },
              { status: 400 },
            );
          await assert.rejects(
            callbackConnection(
              req(
                `/api/meta/instagram/callback?state=${failing.nonce}&code=private-oauth-code`,
                failing.cookie,
              ),
              "instagram",
            ),
            /connect to Meta/,
          );
          assert.equal(
            (await getProject(first.project.id)).instagramAccessToken,
            "ig-long-secret",
          );
          assert.ok(
            !(
              await connectionError(
                "instagram",
                new Error("database-secret"),
              ).text()
            ).includes("database-secret"),
          );
        },
      );
      await t.test(
        "declining Instagram publishing permission does not replace the saved account",
        async () => {
          const flow = await begin("instagram");
          globalThis.fetch = async () =>
            Response.json({
              access_token: "ig-short-secret",
              permissions: ["instagram_business_basic"],
            });
          await assert.rejects(
            callbackConnection(
              req(
                `/api/meta/instagram/callback?state=${flow.nonce}&code=private-oauth-code`,
                flow.cookie,
              ),
              "instagram",
            ),
            /publishing permissions/,
          );
          assert.equal(
            (await getProject(first.project.id)).instagramAccessToken,
            "ig-long-secret",
          );
        },
      );
      await t.test(
        "Meta exchanges redact tokens, client secrets and authorization codes from logs",
        () => {
          const logged = lines.join("");
          for (const secret of [
            "test-app-secret",
            "fb-short-secret",
            "fb-long-secret",
            "page-secret-one",
            "page-secret-two",
            "ig-short-secret",
            "ig-long-secret",
            "private-oauth-code",
          ])
            assert.ok(!logged.includes(secret), secret);
          assert.ok(logged.includes("meta.response"));
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
      logger.clear();
      for (const transport of oldTransports) logger.add(transport);
      logger.level = oldLevel;
      for (const key of credentials) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
      for (const id of pendingIds)
        await getDb()
          .delete(verifications)
          .where(eq(verifications.identifier, id));
      for (const id of created) {
        await getDb().delete(projects).where(eq(projects.userId, id));
        await getDb().delete(users).where(eq(users.id, id));
      }
      await closeDb();
    }
  },
);
