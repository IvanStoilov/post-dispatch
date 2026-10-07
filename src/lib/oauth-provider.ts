import {
  oauthProvider,
  getOAuthProviderApi,
  type OAuthOptions,
} from "@better-auth/oauth-provider";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { z } from "zod";

export const MCP_SCOPES = ["posts:read", "posts:write"] as const;
export function appOrigin() {
  return new URL(process.env.APP_URL || "http://localhost:8200").origin;
}
export function accountResource() {
  return `${appOrigin()}/api/mcp`;
}
export function validateAccountResource(resource: string) {
  if (resource !== accountResource()) throw new Error("Invalid MCP resource");
}
export function oauthPlugins() {
  const opts: OAuthOptions<string[]> = {
    disableJwtPlugin: true,
    loginPage: "/signin",
    consentPage: "/oauth/consent",
    scopes: [...MCP_SCOPES, "offline_access"],
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    // Consent grants access to the signed-in account, including future projects.
    enforcePerClientResources: false,
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 30 * 86400,
    codeExpiresIn: 300,
    resourcePrivileges: async () => false,
    clientPrivileges: async () => false,
    customAccessTokenClaims: async ({ user, resources }) => {
      if (!user || resources?.length !== 1)
        throw new APIError("BAD_REQUEST", { error: "invalid_target" });
      try {
        validateAccountResource(resources[0]);
      } catch {
        throw new APIError("BAD_REQUEST", { error: "invalid_target" });
      }
      return { accountId: user.id };
    },
  };
  return [
    oauthProvider(opts),
    {
      id: "postdispatch-oauth-resource",
      endpoints: {
        verifyMcpOAuthToken: createAuthEndpoint(
          "/internal/mcp-oauth-token",
          {
            method: "POST",
            body: z.object({ token: z.string() }),
            metadata: { SERVER_ONLY: true },
          },
          async (ctx) => {
            const payload = await getOAuthProviderApi(
              ctx,
              opts,
            ).requireActiveAccessToken(ctx.body.token);
            const resource = accountResource();
            const audience = Array.isArray(payload.aud)
              ? payload.aud
              : [payload.aud];
            if (
              payload.iss !== appOrigin() + "/api/auth" ||
              audience.length !== 1 ||
              audience[0] !== resource ||
              payload.accountId !== payload.sub ||
              typeof payload.sub !== "string" ||
              payload.cnf
            )
              throw new APIError("UNAUTHORIZED", { error: "invalid_token" });
            const scopes =
              typeof payload.scope === "string" ? payload.scope.split(" ") : [];
            return { userId: payload.sub, scopes };
          },
        ),
      },
    },
  ];
}
