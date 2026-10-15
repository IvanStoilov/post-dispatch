import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, sql } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import {
  users,
  accounts,
  termsAcceptances,
  oauthClients,
} from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
import { currentTerms } from "../src/lib/terms";
import { acceptedSignup } from "./helpers/terms";
import { listTermsAcceptances } from "../src/lib/terms-acceptance";
import { GET as agreement } from "../src/app/api/account/agreements/[id]/route";
import { POST as accept } from "../src/app/api/account/agreements/route";
import { appOrigin } from "../src/lib/origins";
import { ensureAccountResource } from "../src/lib/oauth";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MAIL_PROVIDER = "console";
function req(path: string, body?: unknown, cookie = "") {
  return new Request(appOrigin() + path, {
    method: body ? "POST" : "GET",
    headers: {
      origin: appOrigin(),
      "content-type": "application/json",
      cookie,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
const ids: string[] = [];
test(
  "explicit terms acceptance, transactional signup, immutability and private original evidence",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const terms = currentTerms();
    const authContext = await getAuth().$context;
    authContext.rateLimit.enabled = false;
    const draft = () => ({
      name: "Terms test",
      email: `terms-${randomUUID()}@example.test`,
      password: `Strong-${randomUUID()}`,
    });
    try {
      await t.test(
        "missing, false, string consent, stale version and tampered hash are rejected without a user",
        async () => {
          for (const changes of [
            { termsAccepted: undefined },
            { termsAccepted: false },
            { termsAccepted: "true" },
            { termsVersion: "old" },
            { termsHash: "0".repeat(64) },
          ]) {
            const body = { ...acceptedSignup(draft()), ...changes };
            const response = await getAuth().handler(
              req("/api/auth/sign-up/email", body),
            );
            assert.equal(response.status, 400, await response.text());
            assert.equal(
              (
                await getDb()
                  .select()
                  .from(users)
                  .where(eq(users.email, body.email))
              ).length,
              0,
            );
          }
        },
      );
      const signup = async () => {
        const body = acceptedSignup(draft());
        const response = await getAuth().handler(
          req("/api/auth/sign-up/email", {
            ...body,
            termsContent: "Forged client terms",
          }),
        );
        assert.equal(response.status, 200, await response.clone().text());
        const { user } = await response.json();
        ids.push(user.id);
        await getDb()
          .update(users)
          .set({ emailVerified: true })
          .where(eq(users.id, user.id));
        const signin = await getAuth().handler(
          req("/api/auth/sign-in/email", {
            email: body.email,
            password: body.password,
          }),
        );
        assert.equal(signin.status, 200);
        return {
          id: user.id,
          cookie: signin.headers
            .getSetCookie()
            .map((v) => v.split(";")[0])
            .join("; "),
        };
      };
      const a = await signup(),
        b = await signup();
      await t.test(
        "OAuth onboarding still requires acceptance and records its source",
        async () => {
          await ensureAccountResource();
          const registered = await getAuth().handler(
            req("/api/auth/oauth2/register", {
              client_name: "Terms OAuth test",
              redirect_uris: ["https://client.example.test/callback"],
              token_endpoint_auth_method: "none",
              grant_types: ["authorization_code"],
              response_types: ["code"],
              scope: "posts:read posts:write",
            }),
          );
          assert.equal(registered.status, 201, await registered.clone().text());
          const client = await registered.json();
          try {
            const query = new URLSearchParams({
              client_id: client.client_id,
              redirect_uri: "https://client.example.test/callback",
              response_type: "code",
              code_challenge: createHash("sha256")
                .update(randomUUID())
                .digest("base64url"),
              code_challenge_method: "S256",
              scope: "posts:read posts:write",
              resource: appOrigin() + "/api/mcp",
              state: randomUUID(),
            });
            const authorized = await getAuth().handler(
              req("/api/auth/oauth2/authorize?" + query),
            );
            const target =
              authorized.status === 302
                ? authorized.headers.get("location")!
                : (await authorized.json()).url;
            const oauthQuery = new URL(
              target,
              appOrigin(),
            ).searchParams.toString();
            const missing = draft();
            assert.equal(
              (
                await getAuth().handler(
                  req("/api/auth/sign-up/email", {
                    ...missing,
                    oauth_query: oauthQuery,
                  }),
                )
              ).status,
              400,
            );
            const body = acceptedSignup(draft());
            const response = await getAuth().handler(
              req("/api/auth/sign-up/email", {
                ...body,
                oauth_query: oauthQuery,
              }),
            );
            assert.equal(response.status, 200, await response.clone().text());
            const { user } = await response.json();
            ids.push(user.id);
            const [evidence] = await getDb()
              .select()
              .from(termsAcceptances)
              .where(eq(termsAcceptances.userId, user.id));
            assert.equal(evidence.acceptanceSource, "oauth_signup");
          } finally {
            await getDb()
              .delete(oauthClients)
              .where(eq(oauthClients.clientId, client.client_id));
          }
        },
      );
      await t.test(
        "unconfigured provider signup cannot bypass the acceptance form",
        async () => {
          const body = draft();
          await assert.rejects(
            authContext.internalAdapter.createOAuthUser(
              { name: body.name, email: body.email, emailVerified: true },
              { providerId: "unconfigured", accountId: randomUUID() },
            ),
          );
          assert.equal(
            (
              await getDb()
                .select()
                .from(users)
                .where(eq(users.email, body.email))
            ).length,
            0,
          );
        },
      );
      const [record] = await getDb()
        .select()
        .from(termsAcceptances)
        .where(eq(termsAcceptances.userId, a.id));
      await t.test(
        "server stores exact canonical text, hash, UTC timestamp and source",
        async () => {
          assert.equal(record.termsVersion, terms.version);
          assert.equal(record.termsContent, terms.content);
          assert.equal(
            record.termsHash,
            createHash("sha256").update(record.termsContent).digest("hex"),
          );
          assert.equal(record.acceptanceSource, "email_signup");
          assert.ok(Date.now() - record.acceptedAt.getTime() < 60000);
          assert.equal(
            (
              await getDb()
                .select()
                .from(accounts)
                .where(eq(accounts.userId, a.id))
            ).length,
            1,
          );
        },
      );
      await t.test(
        "own original is accessible; anonymous and cross-account requests fail",
        async () => {
          const ctx = { params: Promise.resolve({ id: record.id }) };
          assert.equal(
            (await agreement(req(`/api/account/agreements/${record.id}`), ctx))
              .status,
            401,
          );
          assert.equal(
            (
              await agreement(
                req(
                  `/api/account/agreements/${record.id}`,
                  undefined,
                  b.cookie,
                ),
                ctx,
              )
            ).status,
            404,
          );
          const response = await agreement(
            req(`/api/account/agreements/${record.id}`, undefined, a.cookie),
            ctx,
          );
          assert.equal(response.status, 200);
          assert.equal((await response.json()).termsContent, terms.content);
        },
      );
      await t.test(
        "SQL update, delete and truncate are rejected and a new version preserves history",
        async () => {
          await assert.rejects(
            getDb()
              .update(termsAcceptances)
              .set({ termsContent: "changed" })
              .where(eq(termsAcceptances.id, record.id)),
          );
          await assert.rejects(
            getDb()
              .delete(termsAcceptances)
              .where(eq(termsAcceptances.id, record.id)),
          );
          await assert.rejects(
            getDb().execute(sql`TRUNCATE terms_acceptances`),
          );
          await assert.rejects(
            getDb()
              .insert(termsAcceptances)
              .values({
                userId: a.id,
                termsVersion: "invalid",
                termsContent: "x",
                termsHash: "0".repeat(64),
                acceptanceSource: "account",
              }),
          );
          const nextContent = terms.content + "\nHistorical revision fixture.";
          await assert.rejects(
            getDb()
              .insert(termsAcceptances)
              .values({
                userId: b.id,
                termsVersion: terms.version,
                termsContent: nextContent,
                termsHash: createHash("sha256")
                  .update(nextContent)
                  .digest("hex"),
                acceptanceSource: "account",
              }),
          );
          await getDb()
            .insert(termsAcceptances)
            .values({
              userId: a.id,
              termsVersion: `future-${randomUUID()}`,
              termsContent: nextContent,
              termsHash: createHash("sha256").update(nextContent).digest("hex"),
              acceptanceSource: "account",
            });
          assert.equal((await listTermsAcceptances(a.id)).length, 2);
        },
      );
      await t.test(
        "re-acceptance is idempotent and cannot replace original evidence",
        async () => {
          assert.equal(
            (
              await accept(
                req("/api/account/agreements", acceptedSignup({}), a.cookie),
              )
            ).status,
            200,
          );
          const [same] = await getDb()
            .select()
            .from(termsAcceptances)
            .where(eq(termsAcceptances.id, record.id));
          assert.deepEqual(same, record);
        },
      );
      await t.test(
        "failed evidence insert rolls back both user and password account",
        async () => {
          const body = acceptedSignup(draft());
          // Force the adapter to fail only for evidence, preserving the user insertion path.
          const auth = getAuth();
          const context = await auth.$context;
          const original = context.adapter.transaction.bind(context.adapter);
          const transaction = mock.method(
            context.adapter,
            "transaction",
            async (callback: Parameters<typeof original>[0]) =>
              original(async (tx) => {
                const originalCreate = tx.create.bind(tx);
                tx.create = async (input) => {
                  if (input.model === "termsAcceptance")
                    throw new Error("Evidence unavailable");
                  return originalCreate(input);
                };
                return callback(tx);
              }),
          );
          try {
            const response = await auth.handler(
              req("/api/auth/sign-up/email", body),
            );
            assert.ok(response.status >= 400);
          } finally {
            transaction.mock.restore();
          }
          assert.equal(
            (
              await getDb()
                .select()
                .from(users)
                .where(eq(users.email, body.email))
            ).length,
            0,
          );
        },
      );
    } finally {
      // Immutable contractual evidence deliberately survives deletion of these disposable accounts.
      for (const id of ids) await getDb().delete(users).where(eq(users.id, id));
      await closeDb();
    }
  },
);
