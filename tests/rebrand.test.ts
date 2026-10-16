import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../src/db";
import { users, oauthResources } from "../src/db/schema";
import { rotateAccountToken } from "../src/lib/mcp-account";
import { handleMcpRequest } from "../src/server/mcp";
import { protectedResourceMetadata } from "../src/lib/oauth";
import { accountResource } from "../src/lib/oauth-provider";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

test(
  "Ramblo MCP identity and discovery preserve existing OAuth resource records",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const original = { ...process.env };
    const userId = randomUUID(),
      resourceId = randomUUID();
    try {
      delete process.env.VERCEL_URL;
      delete process.env.VERCEL_ENV;
      process.env.APP_URL = `https://brand-${resourceId}.example.test`;
      await getDb()
        .insert(users)
        .values({
          id: userId,
          name: "Brand test",
          email: `${userId}@example.test`,
        });
      await getDb()
        .insert(oauthResources)
        .values({
          id: resourceId,
          identifier: accountResource(),
          name: "PostDispatch account",
          allowedScopes: ["posts:read", "posts:write", "offline_access"],
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      const metadata = await protectedResourceMetadata();
      assert.equal(metadata.status, 200);
      assert.equal((await metadata.json()).resource_name, "Ramblo account");
      const [row] = await getDb()
        .select()
        .from(oauthResources)
        .where(eq(oauthResources.id, resourceId));
      assert.equal(row.id, resourceId);
      assert.equal(row.name, "Ramblo account");
      assert.deepEqual(row.allowedScopes, [
        "posts:read",
        "posts:write",
        "offline_access",
      ]);
      const { mcpToken: token } = await rotateAccountToken(userId);
      const response = await handleMcpRequest(
        new Request(process.env.APP_URL + "/api/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "brand-test", version: "1.0" },
            },
          }),
        }),
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.result.serverInfo.name, "ramblo");
      assert.match(payload.result.instructions, /Ramblo account/);
      assert.doesNotMatch(payload.result.instructions, /PostDispatch/);
    } finally {
      await getDb()
        .delete(oauthResources)
        .where(eq(oauthResources.id, resourceId));
      await getDb().delete(users).where(eq(users.id, userId));
      await closeDb();
      process.env = original;
    }
  },
);
