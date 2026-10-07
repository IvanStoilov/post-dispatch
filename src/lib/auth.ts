import { jwt } from "better-auth/plugins";
import { oauthPlugins, appOrigin } from "./oauth-provider";
import * as schema from "../db/schema";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  users,
  sessions,
  accounts,
  verifications,
  projects,
} from "../db/schema";
const LEGACY_OWNER = "legacy-project-owner";
function makeAuth() {
  if (!process.env.BETTER_AUTH_SECRET)
    throw new Error("BETTER_AUTH_SECRET is required");
  return betterAuth({
    appName: "PostDispatch",
    baseURL: process.env.APP_URL || "http://localhost:8200",
    secret: process.env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        jwks: schema.oauthJwks,
        oauthClient: schema.oauthClients,
        oauthResource: schema.oauthResources,
        oauthClientResource: schema.oauthClientResources,
        oauthRefreshToken: schema.oauthRefreshTokens,
        oauthAccessToken: schema.oauthAccessTokens,
        oauthConsent: schema.oauthConsents,
        oauthClientAssertion: schema.oauthClientAssertions,
      },
    }),
    disabledPaths: ["/token"],
    plugins: [
      jwt({ jwt: { issuer: appOrigin() + "/api/auth" } }),
      ...oauthPlugins(),
    ],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    trustedOrigins: [process.env.APP_URL || "http://localhost:8200"],
    rateLimit: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await getDb().transaction(async (tx) => {
              const legacyEmail =
                process.env.LEGACY_OWNER_EMAIL?.trim().toLowerCase();
              let inherited = false;
              if (legacyEmail && user.email.toLowerCase() === legacyEmail) {
                const claimed = await tx
                  .update(projects)
                  .set({ userId: user.id })
                  .where(eq(projects.userId, LEGACY_OWNER))
                  .returning({ id: projects.id });
                inherited = claimed.length > 0;
              }
              if (!inherited)
                await tx
                  .insert(projects)
                  .values({ userId: user.id, name: "Personal workspace" });
            });
          },
        },
      },
    },
  });
}
const state = globalThis as typeof globalThis & {
  dispatchAuth?: ReturnType<typeof makeAuth>;
  dispatchAuthVersion?: string;
};
export function getAuth() {
  if (state.dispatchAuthVersion !== "oauth-account-v2") {
    state.dispatchAuth = undefined;
    state.dispatchAuthVersion = "oauth-account-v2";
  }
  return (state.dispatchAuth ??= makeAuth());
}
