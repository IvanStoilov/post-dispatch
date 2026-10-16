import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { jwt } from "better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getCurrentAdapter } from "@better-auth/core/context";
import * as schema from "../db/schema";
import { getDb } from "../db";
import { users, sessions, accounts, verifications } from "../db/schema";
import { brand } from "./brand";
import { config } from "./config";
import { logger } from "./logger";
import { sendMail } from "./mail";
import { passwordResetEmail, verificationEmail } from "./mail/templates";
import { oauthPlugins, appOrigin } from "./oauth-provider";
import { termsSystemService } from "@/domain/terms";
// Signup must accept the current terms. Returns them for the evidence
// record; otherwise fails with the codes the signup form handles.
function validateTermsAcceptance(body: Record<string, unknown> | undefined) {
  const result = termsSystemService.check(body ?? {});
  if (result.status === "accepted") {
    return result.terms;
  }
  throw new APIError(
    "BAD_REQUEST",
    result.status === "required"
      ? {
          code: "TERMS_ACCEPTANCE_REQUIRED",
          message: "You must read and agree to Ramblo's Terms of Service.",
        }
      : {
          code: "TERMS_VERSION_CHANGED",
          message:
            "The Terms of Service have changed. Reload this page and review them before accepting.",
        },
  );
}
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
  if (!config.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }
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
      transaction: true,
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        termsAcceptance: schema.termsAcceptances,
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
      {
        id: "ramblo-terms-evidence",
        schema: {
          termsAcceptance: {
            fields: {
              userId: { type: "string", required: true },
              termsVersion: { type: "string", required: true },
              termsContent: { type: "string", required: true },
              termsHash: { type: "string", required: true },
              acceptedAt: { type: "date", required: true },
              acceptanceSource: { type: "string", required: true },
            },
          },
        },
      },
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
      sendVerificationEmail: async ({ user, url }) => {
        logger.info("auth.email.verification.sent", { userId: user.id });

        return await sendMail(
          verificationEmail({ to: user.email, name: user.name, url }),
          "email_verification",
        );
      },
    },
    advanced: { backgroundTasks: { handler: runInBackground } },
    trustedOrigins: [appOrigin()],
    rateLimit: { enabled: true },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email") {
          validateTermsAcceptance(ctx.body);
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            // Also fail closed if a future auth provider introduces another signup path.
            if (ctx?.path !== "/sign-up/email") {
              throw new APIError("BAD_REQUEST", {
                code: "TERMS_ACCEPTANCE_REQUIRED",
                message:
                  "Create your account using the signup form and accept the Terms of Service first.",
              });
            }
            validateTermsAcceptance(ctx.body);
            return { data: user };
          },
          after: async (user) => {
            logger.info("auth.user.created", { userId: user.id });
          },
        },
      },
      account: {
        create: {
          before: async (account, ctx) => {
            if (ctx?.path === "/sign-up/email") {
              const terms = validateTermsAcceptance(ctx.body);
              // Signup's outer transaction contains user, evidence and password account.
              // An evidence failure must roll the entire registration back.
              const adapter = await getCurrentAdapter(ctx.context.adapter);
              await adapter.create({
                model: "termsAcceptance",
                forceAllowId: true,
                data: {
                  id: randomUUID(),
                  userId: account.userId,
                  termsVersion: terms.version,
                  termsContent: terms.content,
                  termsHash: terms.hash,
                  acceptedAt: new Date(),
                  acceptanceSource: ctx.body?.oauth_query
                    ? "oauth_signup"
                    : "email_signup",
                },
              });
            }
            return { data: account };
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
  if (state.dispatchAuthVersion !== "terms-acceptance-v1") {
    state.dispatchAuth = undefined;
    state.dispatchAuthVersion = "terms-acceptance-v1";
  }
  return (state.dispatchAuth ??= makeAuth());
}
