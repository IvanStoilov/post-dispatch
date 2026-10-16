import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Executor, Tx } from "../shared/db";
import type { ConnectorValues, ProjectRecord } from "./types";
import { getDb } from "@/db";
import {
  projectConnectors,
  projects,
  users,
  type ConnectorRow,
  type ProjectRow,
} from "@/db/schema";
import type { Platform } from "@/shared/platforms";

// Every query on projects and their connectors. Rows never leave the
// domain: services map them to DTOs.

function toRecord(
  project: ProjectRow & { connectors: ConnectorRow[] },
): ProjectRecord {
  const facebook = project.connectors.find((c) => c.provider === "facebook");
  const instagram = project.connectors.find((c) => c.provider === "instagram");
  return {
    ...project,
    connections: project.connectors,
    facebookPageId: facebook?.accountId || "",
    facebookPageToken: facebook?.accessToken || "",
    instagramAccountId: instagram?.accountId || "",
    instagramAccessToken: instagram?.accessToken || "",
    instagramApiHost: instagram?.metadata.apiHost || "graph.facebook.com",
  };
}

export async function listOwned(userId: string, db: Executor = getDb()) {
  const rows = await db.query.projects.findMany({
    with: {
      connectors: true,
    },
    where: eq(projects.userId, userId),
    orderBy: desc(projects.createdAt),
  });
  return rows.map((project) => toRecord(project));
}

export async function findById(id: string, db: Executor = getDb()) {
  const project = await db.query.projects.findFirst({
    with: {
      connectors: true,
    },
    where: eq(projects.id, id),
  });
  return project ? toRecord(project) : undefined;
}

export async function findOwned(
  userId: string,
  id: string,
  db: Executor = getDb(),
) {
  const [project] = await db.query.projects.findMany({
    with: {
      connectors: true,
    },
    where: and(eq(projects.id, id), eq(projects.userId, userId)),
  });
  return project ? toRecord(project) : undefined;
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

// Every user's projects, locked. Deletion locks the user row first, then
// projects in ID order, so project and account deletion can't deadlock.
export async function lockAllOwned(tx: Tx, userId: string) {
  return tx
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(asc(projects.id))
    .for("update");
}

export async function lockUser(tx: Tx, userId: string) {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  return !!user;
}

// Connections cascade; posts, jobs and uploads must be deleted first.
export async function removeMany(tx: Tx, ids: string[]) {
  await tx.delete(projects).where(inArray(projects.id, ids));
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
