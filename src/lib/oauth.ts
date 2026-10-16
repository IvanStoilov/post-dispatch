import { brand } from "./brand";
import { config } from "./config";
import { loggedOperation } from "./logger";
import { randomUUID } from "node:crypto";
import { ne } from "drizzle-orm";
import { getDb } from "../db";
import { oauthResources } from "../db/schema";

import { getAuth } from "./auth";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import {
  appOrigin,
  accountResource,
  validateAccountResource,
  MCP_SCOPES,
} from "./oauth-provider";
export async function ensureAccountResource() {
  return loggedOperation("lib.oauth.ensureAccountResource", {}, async () => {
    await getDb()
      .insert(oauthResources)
      .values({
        id: randomUUID(),
        identifier: accountResource(),
        name: `${brand.name} account`,
        allowedScopes: [...MCP_SCOPES, "offline_access"],
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: oauthResources.identifier,
        set: { name: `${brand.name} account` },
        setWhere: ne(oauthResources.name, `${brand.name} account`),
      });
  });
}
export async function protectedResourceMetadata() {
  return loggedOperation(
    "lib.oauth.protectedResourceMetadata",
    {},
    async () => {
      try {
        await ensureAccountResource();
        return Response.json(
          {
            resource: accountResource(),
            authorization_servers: [appOrigin() + "/api/auth"],
            scopes_supported: [...MCP_SCOPES, "offline_access"],
            bearer_methods_supported: ["header"],
            resource_name: `${brand.name} account`,
          },
          { headers: { "Cache-Control": "no-store" } },
        );
      } catch {
        return Response.json(
          { error: "MCP metadata unavailable" },
          { status: 404 },
        );
      }
    },
  );
}
export async function oauthChallenge() {
  return loggedOperation("lib.oauth.oauthChallenge", {}, async () => {
    await ensureAccountResource();
    return Response.json(
      {
        error: "unauthorized",
        message: "Use OAuth or your account bearer token",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource/api/mcp", scope="${MCP_SCOPES.join(" ")}"`,
          "Cache-Control": "no-store",
        },
      },
    );
  });
}
export async function oauthConsentContext(
  query: string,
  userId: string,
  headers: Headers,
) {
  return loggedOperation(
    "lib.oauth.oauthConsentContext",
    { userId },
    async () => {
      if (!(await verifyOAuthQueryParams(query, config.BETTER_AUTH_SECRET!)))
        throw new Error(
          "This connection request is invalid or has expired. Start again from your MCP client.",
        );
      const session = await getAuth().api.getSession({ headers });
      if (!session || session.user.id !== userId)
        throw new Error("Sign in to connect your account");
      const params = new URLSearchParams(query);
      const resources = params.getAll("resource");
      if (resources.length !== 1)
        throw new Error("Connect the account MCP resource");
      validateAccountResource(resources[0]);
      const requested = (params.get("scope") || "").split(" ").filter(Boolean);
      if (
        !requested.length ||
        requested.some((s) => ![...MCP_SCOPES, "offline_access"].includes(s))
      )
        throw new Error("Unsupported permissions requested");
      const client = await getAuth().api.getOAuthClientPublic({
        query: { client_id: params.get("client_id") || "" },
        headers,
      });
      return {
        clientName: client.client_name || "MCP client",
        redirectHost: new URL(params.get("redirect_uri")!).host,
        scopes: requested,
      };
    },
  );
}
