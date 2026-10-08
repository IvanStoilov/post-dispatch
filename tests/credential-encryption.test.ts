import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import {
  encryptCredential,
  decryptCredential,
  CREDENTIAL_PREFIX,
} from "../src/lib/credential-encryption";
import { getDb, closeDb } from "../src/db";
import { users, projects } from "../src/db/schema";
import {
  createProject,
  getProject,
  updateProject,
  saveConnector,
  listProjects,
} from "../src/lib/projects";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Serialize key-changing unit cases with the database case in this process.
test("credentials use authenticated randomized encryption and fail closed", () => {
  const original = process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  try {
    for (const value of ["", "social-token", "unicode-🔒", "a".repeat(4096)]) {
      const one = encryptCredential(value, "access_token");
      const two = encryptCredential(value, "access_token");
      assert.ok(one.startsWith(CREDENTIAL_PREFIX));
      assert.notEqual(one, two);
      assert.equal(decryptCredential(one, "access_token"), value);
      assert.throws(
        () => decryptCredential(one, "refresh_token"),
        /could not be decrypted/,
      );
      const bytes = Buffer.from(
        one.slice(CREDENTIAL_PREFIX.length),
        "base64url",
      );
      bytes[12] ^= 1;
      assert.throws(
        () =>
          decryptCredential(
            CREDENTIAL_PREFIX + bytes.toString("base64url"),
            "access_token",
          ),
        /could not be decrypted/,
      );
    }
    const encrypted = encryptCredential("keep-private", "access_token");
    process.env.CREDENTIALS_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    assert.throws(
      () => decryptCredential(encrypted, "access_token"),
      /could not be decrypted/,
    );
    assert.throws(
      () => decryptCredential("legacy-plaintext", "access_token"),
      /must be migrated/,
    );
    assert.throws(
      () => decryptCredential("pdcred:v2:unsupported", "access_token"),
      /must be migrated/,
    );
    assert.throws(
      () => decryptCredential(CREDENTIAL_PREFIX + "malformed", "access_token"),
      /invalid/,
    );
    process.env.CREDENTIALS_ENCRYPTION_KEY = "invalid";
    assert.throws(
      () => encryptCredential("keep-private", "access_token"),
      /64 characters/,
    );
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    assert.throws(
      () => decryptCredential(encrypted, "access_token"),
      /64 characters/,
    );
  } finally {
    if (original === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CREDENTIALS_ENCRYPTION_KEY = original;
  }
});

test(
  "all connector writes encrypt at rest; reads, updates and public responses stay correct",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const userId = randomUUID();
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 15000,
    });
    try {
      await getDb()
        .insert(users)
        .values({
          id: userId,
          name: "Credential test",
          email: `${userId}@example.test`,
        });
      const { project } = await createProject(userId, {
        name: "Credential encryption test",
        facebookPageId: "page",
        facebookPageToken: "private-facebook",
      });
      await saveConnector(userId, project.id, {
        provider: "linkedin",
        accountId: "urn:li:person:test",
        accessToken: "private-linkedin",
        refreshToken: "private-refresh",
      });
      const raw = await pool.query(
        "SELECT provider, access_token, refresh_token FROM project_connectors WHERE project_id = $1",
        [project.id],
      );
      for (const row of raw.rows) {
        assert.ok(row.access_token.startsWith(CREDENTIAL_PREFIX));
        assert.ok(!row.access_token.includes("private"));
        if (row.refresh_token)
          assert.ok(row.refresh_token.startsWith(CREDENTIAL_PREFIX));
      }
      const hydrated = await getProject(project.id);
      assert.equal(hydrated.facebookPageToken, "private-facebook");
      assert.equal(
        hydrated.connections.find((c) => c.provider === "linkedin")
          ?.refreshToken,
        "private-refresh",
      );
      await updateProject(userId, project.id, {
        name: "Updated",
        facebookPageId: "page-updated",
      });
      assert.equal(
        (await getProject(project.id)).facebookPageToken,
        "private-facebook",
      );
      await updateProject(userId, project.id, {
        name: "Updated",
        facebookPageToken: "replacement",
      });
      assert.equal(
        (await getProject(project.id)).facebookPageToken,
        "replacement",
      );
      await saveConnector(userId, project.id, {
        provider: "linkedin",
        accountId: "urn:li:person:test",
        accessToken: "new-linkedin",
        refreshToken: null,
      });
      assert.equal(
        (await getProject(project.id)).connections.find(
          (c) => c.provider === "linkedin",
        )?.refreshToken,
        null,
      );
      const publicData = JSON.stringify(await listProjects(userId));
      assert.ok(!/private|replacement|new-linkedin|pdcred:/.test(publicData));
      await assert.rejects(
        pool.query(
          "UPDATE project_connectors SET access_token = 'plaintext' WHERE project_id = $1",
          [project.id],
        ),
        (e: unknown) => (e as { code: string }).code === "23514",
      );
      await assert.rejects(
        pool.query(
          "UPDATE project_connectors SET refresh_token = 'plaintext' WHERE project_id = $1",
          [project.id],
        ),
        (e: unknown) => (e as { code: string }).code === "23514",
      );
    } finally {
      await getDb().delete(projects).where(eq(projects.userId, userId));
      await getDb().delete(users).where(eq(users.id, userId));
      await pool.end();
      await closeDb();
    }
  },
);
