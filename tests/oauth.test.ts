import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  users,
  projects,
  posts,
  oauthClients,
  oauthResources,
  oauthAccessTokens,
} from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { listProjects, createProject } from "../src/lib/projects";
import { handleProjectMcp } from "../src/lib/mcp";
import {
  protectedResourceMetadata,
  oauthConsentContext,
} from "../src/lib/oauth";
import {
  GET as listGrants,
  DELETE as disconnectGrant,
} from "../src/app/api/projects/[id]/oauth/route";
import { projectResource } from "../src/lib/oauth-provider";
import { POST as consentRoute } from "../src/app/api/oauth/consent/route";
import { GET as serverMetadata } from "../src/app/.well-known/oauth-authorization-server/api/auth/route";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const origin = process.env.APP_URL || "http://localhost:8200";
const testUsers: string[] = [];
let clientId = "";
let resource = "";
let otherResource = "";
function req(path: string, method = "GET", body?: unknown, cookie = "") {
  return new Request(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      origin,
      cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
}
async function checked(response: Response) {
  const data = await response.json();
  assert.ok(response.ok, JSON.stringify(data));
  return data;
}
async function mcp(
  projectId: string,
  token: string,
  name = "get_project",
  args = {},
) {
  const r = await handleProjectMcp(
    new Request(projectResource(projectId), {
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
    projectId,
  );
  return { response: r, data: await r.json() };
}
async function token(body: Record<string, string>) {
  return getAuth().handler(
    new Request(origin + "/api/auth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
    }),
  );
}
test(
  "OAuth authorization-code flow with project isolation and legacy bearer support",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    try {
      async function signup() {
        const password = "Test-password-" + randomUUID();
        const email = randomUUID() + "@example.test";
        const r = await getAuth().handler(
          req("/api/auth/sign-up/email", "POST", {
            email,
            password,
            name: "OAuth test",
          }),
        );
        const data = await checked(r);
        testUsers.push(data.user.id);
        return { ...data, email, password, cookie: cookies(r) };
      }
      const a = await signup(),
        b = await signup();
      const project = (await listProjects(a.user.id))[0];
      const other = (await listProjects(b.user.id))[0];
      const legacy = await createProject(a.user.id, {
        name: "OAuth bearer test",
      });
      resource = projectResource(project.id);
      otherResource = projectResource(other.id);
      const metadata = await protectedResourceMetadata(project.id);
      assert.equal(metadata.status, 200);
      await protectedResourceMetadata(other.id);
      await t.test(
        "discovery advertises PKCE, token, registration and project resource",
        async () => {
          const d = await checked(
            await serverMetadata(
              req("/.well-known/oauth-authorization-server/api/auth"),
            ),
          );
          assert.equal(d.issuer, origin + "/api/auth");
          assert.deepEqual(d.code_challenge_methods_supported, ["S256"]);
          assert.ok(d.registration_endpoint);
          const challenge = await handleProjectMcp(
            req(`/api/mcp/${project.id}`, "POST", {}),
            project.id,
          );
          assert.equal(challenge.status, 401);
          assert.match(
            challenge.headers.get("WWW-Authenticate")!,
            /resource_metadata=/,
          );
          assert.equal((await metadata.json()).resource, resource);
        },
      );
      const registration = await checked(
        await getAuth().handler(
          req("/api/auth/oauth2/register", "POST", {
            client_name: "PostDispatch OAuth test",
            redirect_uris: ["https://client.example.test/callback"],
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: "posts:read posts:write offline_access",
          }),
        ),
      );
      clientId = registration.client_id;
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      function query(
        res = resource,
        scope = "posts:read posts:write offline_access",
      ) {
        return new URLSearchParams({
          client_id: clientId,
          redirect_uri: "https://client.example.test/callback",
          response_type: "code",
          code_challenge: challenge,
          code_challenge_method: "S256",
          scope,
          state: "state-" + randomUUID(),
          resource: res,
          prompt: "consent",
        });
      }
      async function authorize(q: URLSearchParams, cookie = a.cookie) {
        const response = await getAuth().handler(
          req(
            "/api/auth/oauth2/authorize?" + q.toString(),
            "GET",
            undefined,
            cookie,
          ),
        );
        if (response.status === 302) return response.headers.get("location")!;
        return (await checked(response)).url as string;
      }
      const authQuery = query();
      const consentUrl = new URL(await authorize(authQuery), origin);
      const signed = consentUrl.searchParams.toString();
      await t.test(
        "consent is signed and accessible only to the project owner",
        async () => {
          assert.equal(consentUrl.pathname, "/oauth/consent");
          assert.equal(
            (
              await oauthConsentContext(
                signed,
                a.user.id,
                new Headers({ cookie: a.cookie }),
              )
            ).project.id,
            project.id,
          );
          await assert.rejects(() =>
            oauthConsentContext(
              signed,
              b.user.id,
              new Headers({ cookie: b.cookie }),
            ),
          );
          const tampered = new URLSearchParams(signed);
          tampered.set("resource", otherResource);
          await assert.rejects(
            () =>
              oauthConsentContext(
                tampered.toString(),
                a.user.id,
                new Headers({ cookie: a.cookie }),
              ),
            /invalid|expired/,
          );
          const cross = await consentRoute(
            req(
              "/api/oauth/consent",
              "POST",
              { accept: true, oauth_query: signed },
              b.cookie,
            ),
          );
          assert.equal(cross.status, 400);
        },
      );
      const consent = await checked(
        await consentRoute(
          req(
            "/api/oauth/consent",
            "POST",
            { accept: true, oauth_query: signed },
            a.cookie,
          ),
        ),
      );
      const callback = new URL(consent.url);
      assert.equal(callback.searchParams.get("state"), authQuery.get("state"));
      assert.equal(callback.searchParams.get("iss"), origin + "/api/auth");
      const exchange = {
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: "https://client.example.test/callback",
        code: callback.searchParams.get("code")!,
        code_verifier: verifier,
        resource,
      };
      const issued = await checked(await token(exchange));
      assert.ok(issued.refresh_token);
      await t.test(
        "valid OAuth can create/read drafts only in the approved project",
        async () => {
          const own = await mcp(project.id, issued.access_token);
          assert.equal(own.response.status, 200);
          assert.equal(
            JSON.parse(own.data.result.content[0].text).id,
            project.id,
          );
          const draft = await mcp(
            project.id,
            issued.access_token,
            "create_draft",
            {
              title: "OAuth test",
              caption: "OAuth test",
              platforms: ["facebook"],
            },
          );
          assert.ok(!draft.data.result.isError, JSON.stringify(draft.data));
          assert.equal(
            (await mcp(other.id, issued.access_token)).response.status,
            401,
          );
          assert.equal(
            (await mcp(legacy.project.id, legacy.mcpToken)).response.status,
            200,
          );
          assert.equal(
            (await mcp(project.id, issued.access_token + "tampered")).response
              .status,
            401,
          );
        },
      );
      await t.test(
        "refresh rotates credentials, and revocation blocks access immediately",
        async () => {
          const refreshed = await checked(
            await token({
              grant_type: "refresh_token",
              client_id: clientId,
              refresh_token: issued.refresh_token,
              resource,
            }),
          );
          assert.notEqual(refreshed.refresh_token, issued.refresh_token);
          assert.equal(
            (await mcp(project.id, refreshed.access_token)).response.status,
            200,
          );
          const revoke = await getAuth().handler(
            new Request(origin + "/api/auth/oauth2/revoke", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: clientId,
                token: refreshed.refresh_token,
                token_type_hint: "refresh_token",
              }),
            }),
          );
          assert.equal(revoke.status, 200);
          assert.equal(
            (await mcp(project.id, refreshed.access_token)).response.status,
            401,
          );
        },
      );
      await t.test(
        "denied consent returns access_denied and no authorization code",
        async () => {
          const url = new URL(await authorize(query()), origin);
          const denied = await checked(
            await consentRoute(
              req(
                "/api/oauth/consent",
                "POST",
                { accept: false, oauth_query: url.searchParams.toString() },
                a.cookie,
              ),
            ),
          );
          const cb = new URL(denied.url);
          assert.equal(cb.searchParams.get("error"), "access_denied");
          assert.equal(cb.searchParams.get("code"), null);
        },
      );
      await t.test(
        "read-only grants cannot create drafts, and project disconnect revokes tokens",
        async () => {
          const u = new URL(
            await authorize(query(resource, "posts:read offline_access")),
            origin,
          );
          const allow = await checked(
            await consentRoute(
              req(
                "/api/oauth/consent",
                "POST",
                { accept: true, oauth_query: u.searchParams.toString() },
                a.cookie,
              ),
            ),
          );
          const code = new URL(allow.url).searchParams.get("code")!;
          const readOnly = await checked(await token({ ...exchange, code }));
          assert.equal(
            (await mcp(project.id, readOnly.access_token, "list_posts"))
              .response.status,
            200,
          );
          const denied = await mcp(
            project.id,
            readOnly.access_token,
            "create_draft",
            { title: "Denied", caption: "Denied", platforms: ["facebook"] },
          );
          assert.equal(denied.data.result.isError, true);
          const ctx = { params: Promise.resolve({ id: project.id }) };
          const grants = await checked(
            await listGrants(
              req(
                `/api/projects/${project.id}/oauth`,
                "GET",
                undefined,
                a.cookie,
              ),
              ctx,
            ),
          );
          assert.ok(
            grants.some((g: { clientId: string }) => g.clientId === clientId),
          );
          assert.equal(
            (
              await disconnectGrant(
                req(
                  `/api/projects/${project.id}/oauth?clientId=${clientId}`,
                  "DELETE",
                  undefined,
                  b.cookie,
                ),
                ctx,
              )
            ).status,
            404,
          );
          assert.equal(
            (await mcp(project.id, readOnly.access_token)).response.status,
            200,
          );
          assert.equal(
            (
              await disconnectGrant(
                req(
                  `/api/projects/${project.id}/oauth?clientId=${clientId}`,
                  "DELETE",
                  undefined,
                  a.cookie,
                ),
                ctx,
              )
            ).status,
            200,
          );
          assert.equal(
            (await mcp(project.id, readOnly.access_token)).response.status,
            401,
          );
          assert.equal(
            (
              await token({
                grant_type: "refresh_token",
                client_id: clientId,
                refresh_token: readOnly.refresh_token,
                resource,
              })
            ).status,
            400,
          );
          assert.equal(
            (await mcp(legacy.project.id, legacy.mcpToken)).response.status,
            200,
          );
        },
      );
      await t.test("PKCE and access-token expiry are enforced", async () => {
        const u = new URL(await authorize(query()), origin);
        const allowed = await checked(
          await consentRoute(
            req(
              "/api/oauth/consent",
              "POST",
              { accept: true, oauth_query: u.searchParams.toString() },
              a.cookie,
            ),
          ),
        );
        const code = new URL(allowed.url).searchParams.get("code")!;
        assert.equal(
          (
            await token({
              ...exchange,
              code,
              code_verifier: randomBytes(32).toString("base64url"),
            })
          ).status,
          400,
        );
        const v = new URL(await authorize(query()), origin);
        const allowed2 = await checked(
          await consentRoute(
            req(
              "/api/oauth/consent",
              "POST",
              { accept: true, oauth_query: v.searchParams.toString() },
              a.cookie,
            ),
          ),
        );
        const valid = await checked(
          await token({
            ...exchange,
            code: new URL(allowed2.url).searchParams.get("code")!,
          }),
        );
        assert.equal(
          (await mcp(project.id, valid.access_token)).response.status,
          200,
        );
        await getDb()
          .update(oauthAccessTokens)
          .set({ expiresAt: new Date(Date.now() - 60000) })
          .where(eq(oauthAccessTokens.clientId, clientId));
        assert.equal(
          (await mcp(project.id, valid.access_token)).response.status,
          401,
        );
      });
      await t.test(
        "password signin continues the signed OAuth request",
        async () => {
          const q = query();
          const login = new URL(await authorize(q, ""), origin);
          assert.equal(login.pathname, "/signin");
          const r = await getAuth().handler(
            req(
              "/api/auth/sign-in/email",
              "POST",
              {
                email: a.email,
                password: a.password,
                oauth_query: login.searchParams.toString(),
              },
              "",
            ),
          );
          const resumed = await checked(r);
          assert.equal(new URL(resumed.url, origin).pathname, "/oauth/consent");
        },
      );
      await t.test("authorization code replay is rejected", async () => {
        assert.equal((await token(exchange)).status, 400);
      });
    } finally {
      try {
        if (clientId)
          await getDb()
            .delete(oauthClients)
            .where(eq(oauthClients.clientId, clientId));
        if (resource || otherResource)
          await getDb()
            .delete(oauthResources)
            .where(
              inArray(oauthResources.identifier, [resource, otherResource]),
            );
        if (testUsers.length) {
          const owned = await getDb()
            .select({ id: projects.id })
            .from(projects)
            .where(inArray(projects.userId, testUsers));
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
            .where(inArray(projects.userId, testUsers));
          await getDb().delete(users).where(inArray(users.id, testUsers));
        }
      } finally {
        await closeDb();
      }
    }
  },
);
