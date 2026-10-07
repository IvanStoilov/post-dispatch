import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  projects,
  projectConnectors,
  type ProjectRow,
  type ConnectorRow,
} from "../db/schema";
import type { Project, Platform } from "./types";
export type ConnectedProject = ProjectRow & {
  connections: ConnectorRow[];
  facebookPageId: string;
  facebookPageToken: string;
  instagramAccountId: string;
  instagramAccessToken: string;
  instagramApiHost: string;
};
function connected(p: ProjectRow, rows: ConnectorRow[]): ConnectedProject {
  const fb = rows.find((c) => c.provider === "facebook");
  const ig = rows.find((c) => c.provider === "instagram");
  return {
    ...p,
    connections: rows,
    facebookPageId: fb?.accountId || "",
    facebookPageToken: fb?.accessToken || "",
    instagramAccountId: ig?.accountId || "",
    instagramAccessToken: ig?.accessToken || "",
    instagramApiHost: ig?.metadata.apiHost || "graph.facebook.com",
  };
}
export function isConnected(c: ConnectorRow) {
  return (
    !!(c.accountId && c.accessToken) &&
    (!c.expiresAt || c.expiresAt.getTime() > Date.now())
  );
}
async function hydrateProject(p: ProjectRow) {
  return connected(
    p,
    await getDb()
      .select()
      .from(projectConnectors)
      .where(eq(projectConnectors.projectId, p.id)),
  );
}
const projectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  facebookPageId: z.string().trim().max(100).optional(),
  facebookPageToken: z.string().trim().max(4096).optional(),
  instagramAccountId: z.string().trim().max(100).optional(),
  instagramAccessToken: z.string().trim().max(4096).optional(),
  instagramApiHost: z
    .enum(["graph.facebook.com", "graph.instagram.com"])
    .optional(),
});
export function publicProject(p: ConnectedProject): Project {
  return {
    id: p.id,
    name: p.name,
    facebookPageId: p.facebookPageId,
    instagramAccountId: p.instagramAccountId,
    instagramApiHost: p.instagramApiHost as Project["instagramApiHost"],
    facebookConfigured: !!(p.facebookPageId && p.facebookPageToken),
    instagramConfigured: !!(p.instagramAccountId && p.instagramAccessToken),
    connectors: Object.fromEntries(
      p.connections.map((c) => [
        c.provider,
        {
          accountId: c.accountId,
          accountName: c.accountName,
          configured: isConnected(c),
          expiresAt: c.expiresAt?.toISOString() || null,
        },
      ]),
    ),
  };
}
export async function getProject(id: string) {
  z.uuid().parse(id);
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id));
  if (!p) throw new Error("Project not found");
  return hydrateProject(p);
}
export async function listProjects(userId: string) {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
  const connections = await getDb()
    .select()
    .from(projectConnectors)
    .innerJoin(projects, eq(projects.id, projectConnectors.projectId))
    .where(eq(projects.userId, userId));
  return rows.map((p) =>
    publicProject(
      connected(
        p,
        connections
          .filter((c) => c.projects.id === p.id)
          .map((c) => c.project_connectors),
      ),
    ),
  );
}
export async function createProject(userId: string, input: unknown) {
  const values = projectSchema.parse(input);
  const [p] = await getDb()
    .insert(projects)
    .values({ name: values.name, userId })
    .returning();
  const project = await updateProject(userId, p.id, values);
  return { project };
}
export async function updateProject(
  userId: string,
  id: string,
  input: unknown,
) {
  z.uuid().parse(id);
  const values = projectSchema.parse(input);
  await getDb().transaction(async (tx) => {
    const [p] = await tx
      .update(projects)
      .set({ name: values.name, updatedAt: sql`now()` })
      .where(and(eq(projects.id, id), eq(projects.userId, userId)))
      .returning();
    if (!p) throw new Error("Project not found");
    for (const provider of ["facebook", "instagram"] as const) {
      const accountId =
        provider === "facebook"
          ? values.facebookPageId
          : values.instagramAccountId;
      const accessToken =
        provider === "facebook"
          ? values.facebookPageToken
          : values.instagramAccessToken;
      if (
        accountId === undefined &&
        accessToken === undefined &&
        !(provider === "instagram" && values.instagramApiHost !== undefined)
      )
        continue;
      const [old] = await tx
        .select()
        .from(projectConnectors)
        .where(
          and(
            eq(projectConnectors.projectId, id),
            eq(projectConnectors.provider, provider),
          ),
        )
        .for("update");
      const data = {
        projectId: id,
        provider,
        accountId: accountId ?? old?.accountId ?? "",
        accessToken: accessToken ?? old?.accessToken ?? "",
        metadata:
          provider === "instagram"
            ? {
                apiHost:
                  values.instagramApiHost ??
                  old?.metadata.apiHost ??
                  "graph.facebook.com",
              }
            : {},
        updatedAt: new Date(),
      };
      if (!data.accountId && !data.accessToken)
        await tx
          .delete(projectConnectors)
          .where(
            and(
              eq(projectConnectors.projectId, id),
              eq(projectConnectors.provider, provider),
            ),
          );
      else
        await tx
          .insert(projectConnectors)
          .values(data)
          .onConflictDoUpdate({
            target: [projectConnectors.projectId, projectConnectors.provider],
            set: data,
          });
    }
  });
  return publicProject(await getOwnedProject(userId, id));
}
export async function saveConnector(
  userId: string,
  projectId: string,
  values: Omit<typeof projectConnectors.$inferInsert, "id" | "projectId">,
) {
  await getDb().transaction(async (tx) => {
    const [p] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
      .for("update");
    if (!p) throw new Error("Project not found");
    await tx
      .insert(projectConnectors)
      .values({ ...values, projectId })
      .onConflictDoUpdate({
        target: [projectConnectors.projectId, projectConnectors.provider],
        set: {
          ...values,
          refreshToken: values.refreshToken ?? null,
          expiresAt: values.expiresAt ?? null,
          scopes: values.scopes ?? [],
          metadata: values.metadata ?? {},
          updatedAt: new Date(),
        },
      });
  });
}
export async function disconnectConnector(
  userId: string,
  projectId: string,
  provider: Platform,
) {
  await getOwnedProject(userId, projectId);
  await getDb()
    .delete(projectConnectors)
    .where(
      and(
        eq(projectConnectors.projectId, projectId),
        eq(projectConnectors.provider, provider),
      ),
    );
}

export async function getOwnedProject(userId: string, id: string) {
  z.uuid().parse(id);
  const [p] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  if (!p) throw new Error("Project not found");
  return hydrateProject(p);
}
