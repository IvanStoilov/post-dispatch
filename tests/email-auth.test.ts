import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq, inArray } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { projects, users } from "../src/db/schema";
import { getAuth } from "../src/lib/auth";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MAIL_PROVIDER = "console";
const origin = process.env.APP_URL || "http://localhost:8200";
const createdUsers: string[] = [];
function request(path: string, method = "GET", cookie = "", body?: unknown) {
  return new Request(path.startsWith("http") ? path : origin + path, {
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
// The console mail provider prints each email; capture them by recipient.
const outbox: string[] = [];
const realInfo = console.info;
async function nextMail(to: string, after: number) {
  for (let i = 0; i < 100; i++) {
    const found = outbox
      .slice(after)
      .find((mail) => mail.includes(`To: ${to}\n`));
    if (found) return found.match(/(https?:\/\/\S+)/)![1];
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`No email to ${to}`);
}
test(
  "email verification and password reset",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    console.info = (...args: unknown[]) => {
      if (String(args[0]).includes("--- Email")) outbox.push(String(args[0]));
      else realInfo(...args);
    };
    try {
      const auth = getAuth();
      const email = randomUUID() + "@example.test";
      const password = "Test-only-password-" + randomUUID();
      const newPassword = "Test-only-password-" + randomUUID();
      let mark = outbox.length;
      const signup = await auth.handler(
        request("/api/auth/sign-up/email", "POST", "", {
          name: "Mail test",
          email,
          password,
          callbackURL: "/signin?verified=1",
        }),
      );
      assert.equal(signup.status, 200);
      createdUsers.push((await signup.json()).user.id);
      const firstLink = await nextMail(email, mark);

      await t.test(
        "unverified sign-in is refused and re-sends the link",
        async () => {
          mark = outbox.length;
          const response = await auth.handler(
            request("/api/auth/sign-in/email", "POST", "", { email, password }),
          );
          assert.equal(response.status, 403);
          assert.equal((await response.json()).code, "EMAIL_NOT_VERIFIED");
          assert.equal(cookies(response), "");
          await nextMail(email, mark);
        },
      );

      await t.test("a bad link redirects back with an error", async () => {
        const bad = new URL(firstLink);
        bad.searchParams.set("token", "not-a-token");
        const response = await auth.handler(request(bad.href));
        assert.equal(response.status, 302);
        assert.match(response.headers.get("location")!, /verified=1.*error=/);
      });

      let session = "";
      await t.test("the link verifies the email and signs in", async () => {
        const response = await auth.handler(request(firstLink));
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/signin?verified=1");
        session = cookies(response);
        assert.ok(session);
        const [user] = await getDb()
          .select()
          .from(users)
          .where(eq(users.email, email));
        assert.equal(user.emailVerified, true);
      });

      await t.test(
        "unknown emails get the same reset response and no mail",
        async () => {
          mark = outbox.length;
          const response = await auth.handler(
            request("/api/auth/request-password-reset", "POST", "", {
              email: randomUUID() + "@example.test",
              redirectTo: "/reset-password",
            }),
          );
          assert.equal(response.status, 200);
          await new Promise((r) => setTimeout(r, 200));
          assert.equal(outbox.length, mark);
        },
      );

      await t.test(
        "password reset works once and signs out other sessions",
        async () => {
          mark = outbox.length;
          const requested = await auth.handler(
            request("/api/auth/request-password-reset", "POST", "", {
              email,
              redirectTo: "/reset-password",
            }),
          );
          assert.equal(requested.status, 200);
          const link = await nextMail(email, mark);
          const landing = await auth.handler(request(link));
          assert.equal(landing.status, 302);
          const target = new URL(landing.headers.get("location")!, origin);
          assert.equal(target.pathname, "/reset-password");
          const token = target.searchParams.get("token")!;
          assert.ok(token);
          const reset = () =>
            auth.handler(
              request("/api/auth/reset-password", "POST", "", {
                newPassword,
                token,
              }),
            );
          assert.equal((await reset()).status, 200);
          assert.equal((await reset()).status, 400);
          const current = await auth.handler(
            request("/api/auth/get-session", "GET", session),
          );
          assert.equal(await current.json(), null);
          const old = await auth.handler(
            request("/api/auth/sign-in/email", "POST", "", { email, password }),
          );
          assert.equal(old.status, 401);
          const fresh = await auth.handler(
            request("/api/auth/sign-in/email", "POST", "", {
              email,
              password: newPassword,
            }),
          );
          assert.equal(fresh.status, 200);
        },
      );
    } finally {
      console.info = realInfo;
      try {
        if (createdUsers.length) {
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
