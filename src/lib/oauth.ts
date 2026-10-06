import { randomUUID } from "node:crypto";
import { and, arrayContains, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  oauthResources,
  oauthConsents,
  oauthClients,
  oauthAccessTokens,
  oauthRefreshTokens,
} from "../db/schema";
import { getProject, getOwnedProject } from "./projects";
import { getAuth } from "./auth";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import {
  appOrigin,
  projectResource,
  resourceProject,
  MCP_SCOPES,
} from "./oauth-provider";
export async function ensureProjectResource(projectId: string) {
  const project = await getProject(projectId);
  await getDb()
    .insert(oauthResources)
    .values({
      id: randomUUID(),
      identifier: projectResource(projectId),
      name: `PostDispatch: ${project.name}`,
      allowedScopes: [...MCP_SCOPES, "offline_access"],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: oauthResources.identifier });
  return project;
}
export async function protectedResourceMetadata(projectId: string) {
  try {
    await ensureProjectResource(projectId);
    return Response.json(
      {
        resource: projectResource(projectId),
        authorization_servers: [appOrigin() + "/api/auth"],
        scopes_supported: [...MCP_SCOPES, "offline_access"],
        bearer_methods_supported: ["header"],
        resource_name: "PostDispatch project",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
}
export async function oauthChallenge(projectId: string) {
  await ensureProjectResource(projectId);
  return Response.json(
    {
      error: "unauthorized",
      message: "Use OAuth or this project's bearer token",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="${appOrigin()}/.well-known/oauth-protected-resource/api/mcp/${projectId}", scope="${MCP_SCOPES.join(" ")}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
export async function oauthConsentContext(
  query: string,
  userId: string,
  headers: Headers,
) {
  if (!(await verifyOAuthQueryParams(query, process.env.BETTER_AUTH_SECRET!)))
    throw new Error(
      "This connection request is invalid or has expired. Start again from your MCP client.",
    );
  const params = new URLSearchParams(query);
  const resources = params.getAll("resource");
  if (resources.length !== 1) throw new Error("Connect one project at a time");
  const project = await getOwnedProject(userId, resourceProject(resources[0]));
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
    project,
    clientName: client.client_name || "MCP client",
    redirectHost: new URL(params.get("redirect_uri")!).host,
    scopes: requested,
  };
}

export async function listOAuthConnections(userId: string, projectId: string) {
  const resource = projectResource(projectId);
  const rows = await getDb()
    .select({
      clientId: oauthConsents.clientId,
      name: oauthClients.name,
      scopes: oauthConsents.scopes,
    })
    .from(oauthConsents)
    .leftJoin(oauthClients, eq(oauthConsents.clientId, oauthClients.clientId))
    .where(
      and(
        eq(oauthConsents.userId, userId),
        arrayContains(oauthConsents.resources, [resource]),
      ),
    );
  return [
    ...new Map(
      rows.map((row) => [
        row.clientId,
        { ...row, name: row.name || "MCP client" },
      ]),
    ).values(),
  ];
}
export async function disconnectOAuth(
  userId: string,
  projectId: string,
  clientId: string,
) {
  const resource = projectResource(projectId);
  await getDb().transaction(async (tx) => {
    for (const table of [oauthAccessTokens, oauthRefreshTokens])
      await tx
        .update(table)
        .set({ revoked: new Date() })
        .where(
          and(
            eq(table.userId, userId),
            eq(table.clientId, clientId),
            arrayContains(table.resources, [resource]),
          ),
        );
    await tx
      .delete(oauthConsents)
      .where(
        and(
          eq(oauthConsents.userId, userId),
          eq(oauthConsents.clientId, clientId),
          arrayContains(oauthConsents.resources, [resource]),
        ),
      );
  });
}
