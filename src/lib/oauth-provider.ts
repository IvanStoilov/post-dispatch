import {
  oauthProvider,
  getOAuthProviderApi,
  type OAuthOptions,
} from "@better-auth/oauth-provider";
import { createAuthEndpoint, APIError } from "better-auth/api";
import { z } from "zod";
import { getOwnedProject } from "./projects";
export const MCP_SCOPES = ["posts:read", "posts:write"] as const;
export function appOrigin() {
  return new URL(process.env.APP_URL || "http://localhost:8200").origin;
}
export function projectResource(id: string) {
  return `${appOrigin()}/api/mcp/${z.uuid().parse(id)}`;
}
export function resourceProject(resource: string) {
  const url = new URL(resource);
  const match = url.pathname.match(/^\/api\/mcp\/([0-9a-f-]{36})$/i);
  if (url.origin !== appOrigin() || url.search || url.hash || !match)
    throw new Error("Invalid MCP resource");
  const id = z.uuid().parse(match[1]);
  if (resource !== projectResource(id)) throw new Error("Invalid MCP resource");
  return id;
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
    // Any registered client can request a project resource; the user must own it
    // and approve it. Tokens remain bound to that exact resource.
    enforcePerClientResources: false,
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 30 * 86400,
    codeExpiresIn: 300,
    resourcePrivileges: async () => false,
    clientPrivileges: async () => false,
    customAccessTokenClaims: async ({ user, resources }) => {
      if (!user || resources?.length !== 1)
        throw new APIError("BAD_REQUEST", { error: "invalid_target" });
      const projectId = resourceProject(resources[0]);
      try {
        await getOwnedProject(user.id, projectId);
      } catch {
        throw new APIError("FORBIDDEN", { error: "access_denied" });
      }
      return { projectId };
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
            body: z.object({ token: z.string(), projectId: z.uuid() }),
            metadata: { SERVER_ONLY: true },
          },
          async (ctx) => {
            const payload = await getOAuthProviderApi(
              ctx,
              opts,
            ).requireActiveAccessToken(ctx.body.token);
            const resource = projectResource(ctx.body.projectId);
            const audience = Array.isArray(payload.aud)
              ? payload.aud
              : [payload.aud];
            if (
              payload.iss !== appOrigin() + "/api/auth" ||
              audience.length !== 1 ||
              audience[0] !== resource ||
              payload.projectId !== ctx.body.projectId ||
              typeof payload.sub !== "string" ||
              payload.cnf
            )
              throw new APIError("UNAUTHORIZED", { error: "invalid_token" });
            await getOwnedProject(payload.sub, ctx.body.projectId);
            const scopes =
              typeof payload.scope === "string" ? payload.scope.split(" ") : [];
            return { userId: payload.sub, scopes };
          },
        ),
      },
    },
  ];
}
