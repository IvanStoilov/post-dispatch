import { brand } from "./brand";
import { config } from "./config";
import { logger } from "./logger";
import { after } from "next/server";
import { sendMail } from "./mail";
import { passwordResetEmail, verificationEmail } from "./mail/templates";
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
// Emails go out after the response so slow providers don't delay requests
// and response timing doesn't reveal whether an account exists.
function runInBackground(task: Promise<unknown>) {
  const logged = task.catch((error) =>
    logger.error("auth.background.failed", { error }),
  );
  try {
    after(logged);
  } catch {
    // Outside a Next.js request (scripts, tests) there is no after().
    void logged;
  }
}
function makeAuth() {
  if (!config.BETTER_AUTH_SECRET)
    throw new Error("BETTER_AUTH_SECRET is required");
  return betterAuth({
    appName: brand.name,
    logger: {
      level: "debug",
      log: (level, message) =>
        logger.log(level, "auth.library", { reason: message }),
    },
    baseURL: appOrigin(),
    secret: config.BETTER_AUTH_SECRET,
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
      requireEmailVerification: true,
      autoSignIn: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        sendMail(
          passwordResetEmail({ to: user.email, name: user.name, url }),
          "password_reset",
        ),
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in unverified re-sends the link, so expired links recover.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) =>
        sendMail(
          verificationEmail({ to: user.email, name: user.name, url }),
          "email_verification",
        ),
    },
    advanced: { backgroundTasks: { handler: runInBackground } },
    trustedOrigins: [appOrigin()],
    rateLimit: { enabled: true },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            logger.info("auth.user.created", { userId: user.id });
            await getDb().transaction(async (tx) => {
              const legacyEmail =
                config.LEGACY_OWNER_EMAIL?.trim().toLowerCase();
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
            logger.info("auth.workspace.ready", { userId: user.id });
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
  if (state.dispatchAuthVersion !== "email-verification-v1") {
    state.dispatchAuth = undefined;
    state.dispatchAuthVersion = "email-verification-v1";
  }
  return (state.dispatchAuth ??= makeAuth());
}
