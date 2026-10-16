import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  projectConnectors,
  projects,
  type ConnectorRow,
  type ProjectRow,
} from "@/db/schema";
import type { Platform } from "@/shared/platforms";
import type { Executor, Tx } from "../shared/db";
import type { ConnectorValues, ProjectRecord } from "./types";

// Every query on projects and their connectors. Rows never leave the
// domain: services map them to DTOs.

function toRecord(project: ProjectRow, rows: ConnectorRow[]): ProjectRecord {
  const facebook = rows.find((c) => c.provider === "facebook");
  const instagram = rows.find((c) => c.provider === "instagram");
  return {
    ...project,
    connections: rows,
    facebookPageId: facebook?.accountId || "",
    facebookPageToken: facebook?.accessToken || "",
    instagramAccountId: instagram?.accountId || "",
    instagramAccessToken: instagram?.accessToken || "",
    instagramApiHost: instagram?.metadata.apiHost || "graph.facebook.com",
  };
}
async function withConnections(project: ProjectRow, db: Executor) {
  const rows = await db
    .select()
    .from(projectConnectors)
    .where(eq(projectConnectors.projectId, project.id));
  return toRecord(project, rows);
}

export async function listOwned(userId: string, db: Executor = getDb()) {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt));
  const connections = await db
    .select({ connector: projectConnectors })
    .from(projectConnectors)
    .innerJoin(projects, eq(projects.id, projectConnectors.projectId))
    .where(eq(projects.userId, userId));
  return rows.map((project) =>
    toRecord(
      project,
      connections
        .map((c) => c.connector)
        .filter((c) => c.projectId === project.id),
    ),
  );
}

export async function findById(id: string, db: Executor = getDb()) {
  const [project] = await db.select().from(projects).where(eq(projects.id, id));
  return project ? withConnections(project, db) : undefined;
}

export async function findOwned(
  userId: string,
  id: string,
  db: Executor = getDb(),
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return project ? withConnections(project, db) : undefined;
}

export async function isOwned(
  userId: string,
  id: string,
  db: Executor = getDb(),
) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return !!project;
}

// Locks the user's project row for the rest of the transaction; undefined
// when it doesn't exist or belongs to someone else.
export async function lockOwned(tx: Tx, userId: string, id: string) {
  const [project] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .for("update");
  return project as ProjectRow | undefined;
}

export async function insert(tx: Tx, values: { userId: string; name: string }) {
  const [project] = await tx.insert(projects).values(values).returning();
  return project;
}

export async function rename(tx: Tx, id: string, name: string) {
  await tx
    .update(projects)
    .set({ name, updatedAt: sql`now()` })
    .where(eq(projects.id, id));
}

export async function lockConnector(
  tx: Tx,
  projectId: string,
  provider: Platform,
) {
  const [connector] = await tx
    .select()
    .from(projectConnectors)
    .where(
      and(
        eq(projectConnectors.projectId, projectId),
        eq(projectConnectors.provider, provider),
      ),
    )
    .for("update");
  return connector as ConnectorRow | undefined;
}

// Inserts the connection or, if one exists for the provider, sets exactly
// the given values on it.
export async function upsertConnector(
  tx: Tx,
  projectId: string,
  values: ConnectorValues,
) {
  await tx
    .insert(projectConnectors)
    .values({ ...values, projectId })
    .onConflictDoUpdate({
      target: [projectConnectors.projectId, projectConnectors.provider],
      set: { ...values, updatedAt: new Date() },
    });
}

export async function deleteConnector(
  db: Executor,
  projectId: string,
  provider: Platform,
) {
  await db
    .delete(projectConnectors)
    .where(
      and(
        eq(projectConnectors.projectId, projectId),
        eq(projectConnectors.provider, provider),
      ),
    );
}
