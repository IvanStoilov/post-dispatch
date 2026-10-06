import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { projects, type ProjectRow } from "../db/schema";
import type { Project } from "./types";
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
export function publicProject(p: ProjectRow): Project {
  return {
    id: p.id,
    name: p.name,
    facebookPageId: p.facebookPageId,
    instagramAccountId: p.instagramAccountId,
    instagramApiHost: p.instagramApiHost as Project["instagramApiHost"],
    facebookConfigured: !!(p.facebookPageId && p.facebookPageToken),
    instagramConfigured: !!(p.instagramAccountId && p.instagramAccessToken),
    mcpConfigured: !!p.mcpTokenHash,
  };
}
export async function getProject(id: string) {
  z.uuid().parse(id);
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id));
  if (!p) throw new Error("Project not found");
  return p;
}
export async function listProjects(userId: string) {
  return (
    await getDb()
      .select()
      .from(projects)
      .where(eq(projects.userId, userId))
      .orderBy(desc(projects.createdAt))
  ).map(publicProject);
}
function tokenPair() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
}
export async function createProject(userId: string, input: unknown) {
  const values = projectSchema.parse(input);
  const { token, hash } = tokenPair();
  const [p] = await getDb()
    .insert(projects)
    .values({ ...values, userId, mcpTokenHash: hash })
    .returning();
  return { project: publicProject(p), mcpToken: token };
}
export async function updateProject(
  userId: string,
  id: string,
  input: unknown,
) {
  z.uuid().parse(id);
  const values = projectSchema.parse(input);
  const [p] = await getDb()
    .update(projects)
    .set({ ...values, updatedAt: sql`now()` })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  if (!p) throw new Error("Project not found");
  return publicProject(p);
}
export async function rotateProjectToken(userId: string, id: string) {
  z.uuid().parse(id);
  const { token, hash } = tokenPair();
  const [p] = await getDb()
    .update(projects)
    .set({ mcpTokenHash: hash, updatedAt: sql`now()` })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  if (!p) throw new Error("Project not found");
  return { project: publicProject(p), mcpToken: token };
}
export function verifyProjectToken(
  project: ProjectRow,
  authorization: string | null,
) {
  if (!project.mcpTokenHash || !authorization?.startsWith("Bearer "))
    return false;
  const actual = createHash("sha256").update(authorization.slice(7)).digest();
  return timingSafeEqual(actual, Buffer.from(project.mcpTokenHash, "hex"));
}

export async function getOwnedProject(userId: string, id: string) {
  z.uuid().parse(id);
  const [p] = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  if (!p) throw new Error("Project not found");
  return p;
}
