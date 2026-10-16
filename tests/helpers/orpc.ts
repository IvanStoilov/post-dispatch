import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { createORPCClient, ORPCError } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { JsonifiedClient } from "@orpc/openapi-client";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import * as route from "../../src/app/api/v1/[[...rest]]/route";
import { contract } from "../../src/contract";
import { getDb } from "../../src/db";
import { posts, projects, users } from "../../src/db/schema";
import { getAuth } from "../../src/lib/auth";
import { loadEnvConfig } from "@next/env";
import { acceptedSignup } from "./terms";

// Imports run before a test file's own setup, so load the env here too.
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
export const origin = process.env.APP_URL || "http://localhost:8200";
export type Api = JsonifiedClient<ContractRouterClient<typeof contract>>;

// Every request the test clients send, as "METHOD /path".
export const sent: string[] = [];

// The same typed REST client the frontend uses, with requests handed
// straight to the /api/v1 route handler instead of the network.
export function client(cookie = ""): Api {
  return createORPCClient(
    new OpenAPILink(contract, {
      url: `${origin}/api/v1`,
      headers: { origin, cookie },
      fetch: (request) => {
        sent.push(`${request.method} ${new URL(request.url).pathname}`);
        const method = request.method as
          "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        return route[method](request);
      },
    }),
  );
}

// Expected failures must arrive as defined errors: typed on the client and
// safe to show (see src/server/orpc.ts).
export async function rejectsWith(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  await assert.rejects(promise, (error) => {
    caught = error;
    assert.ok(error instanceof ORPCError, String(error));
    assert.equal(error.code, code);
    assert.equal(error.defined, true, `${code} should be a defined error`);
    return true;
  });
  return caught as ORPCError<string, unknown>;
}

// Signed-in, verified users for one test; cleanup() removes them and their
// projects and posts.
export function testUsers() {
  const created: string[] = [];
  const password = "Test-only-password-" + randomUUID();
  const auth = (path: string, body: unknown) =>
    getAuth().handler(
      new Request(origin + path, {
        method: "POST",
        headers: { origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  return {
    async signedIn() {
      const email = randomUUID() + "@example.test";
      const signup = await auth(
        "/api/auth/sign-up/email",
        acceptedSignup({ name: "oRPC test", email, password }),
      );
      const { user } = await signup.json();
      created.push(user.id);
      await getDb()
        .update(users)
        .set({ emailVerified: true })
        .where(eq(users.id, user.id));
      const signin = await auth("/api/auth/sign-in/email", { email, password });
      const cookie = signin.headers
        .getSetCookie()
        .map((v) => v.split(";")[0])
        .join("; ");
      return client(cookie);
    },
    async cleanup() {
      if (!created.length) return;
      const owned = await getDb()
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.userId, created));
      if (owned.length)
        await getDb()
          .delete(posts)
          .where(
            inArray(
              posts.projectId,
              owned.map((p) => p.id),
            ),
          );
      await getDb().delete(projects).where(inArray(projects.userId, created));
      await getDb().delete(users).where(inArray(users.id, created));
    },
  };
}
