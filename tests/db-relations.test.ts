import test from "node:test";
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { closeDb, getDb } from "../src/db";
loadEnvConfig(process.cwd());
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// Drizzle only resolves relations when a relational query is built, so a
// relation missing its other side fails at runtime. Load every relation in
// both directions; an empty result is fine, an error is not.
test(
  "every schema relation resolves in both directions",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const db = getDb();
    try {
      const queries = [
        db.query.users.findFirst({
          with: {
            sessions: {
              with: { oauthRefreshTokens: true, oauthAccessTokens: true },
            },
            accounts: true,
            projects: {
              with: {
                connectors: true,
                posts: {
                  with: { assets: true, publishJobs: true, publications: true },
                },
                uploadTokens: true,
                imageUploads: true,
                directUploads: true,
                publishJobs: true,
                publications: true,
              },
            },
            mcpToken: true,
            termsAcceptances: true,
            oauthClients: {
              with: {
                resources: { with: { resource: true } },
                refreshTokens: { with: { accessTokens: true } },
                accessTokens: true,
                consents: true,
              },
            },
            oauthRefreshTokens: true,
            oauthAccessTokens: true,
            oauthConsents: true,
          },
        }),
        db.query.termsAcceptances.findFirst({ with: { user: true } }),
        db.query.accountMcpTokens.findFirst({ with: { user: true } }),
        db.query.accounts.findFirst({ with: { user: true } }),
        db.query.projectConnectors.findFirst({
          with: { project: { with: { user: true } } },
        }),
        db.query.uploadTokens.findFirst({ with: { project: true } }),
        db.query.imageUploads.findFirst({ with: { project: true } }),
        db.query.directUploads.findFirst({ with: { project: true } }),
        db.query.postAssets.findFirst({
          with: { post: { with: { project: true } } },
        }),
        db.query.publishJobs.findFirst({ with: { post: true, project: true } }),
        db.query.postPublications.findFirst({
          with: { post: true, project: true },
        }),
        db.query.oauthResources.findFirst({
          with: { clients: { with: { client: true } } },
        }),
        db.query.oauthAccessTokens.findFirst({
          with: {
            client: true,
            session: { with: { user: true } },
            user: true,
            refreshToken: { with: { client: true, session: true, user: true } },
          },
        }),
        db.query.oauthConsents.findFirst({
          with: { client: true, user: true },
        }),
        db.query.oauthClients.findFirst({ with: { user: true } }),
      ];
      for (const query of queries) await assert.doesNotReject(query);
    } finally {
      await closeDb();
    }
  },
);
