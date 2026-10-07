import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { accountMcpTokens } from "../db/schema";
import { listProjects, getOwnedProject } from "./projects";
export async function accountTokenConfigured(userId: string) {
  const [row] = await getDb()
    .select({ userId: accountMcpTokens.userId })
    .from(accountMcpTokens)
    .where(eq(accountMcpTokens.userId, userId));
  return !!row;
}
export async function rotateAccountToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await getDb()
    .insert(accountMcpTokens)
    .values({ userId, tokenHash })
    .onConflictDoUpdate({
      target: accountMcpTokens.userId,
      set: { tokenHash, updatedAt: new Date() },
    });
  return { mcpToken: token };
}
export async function verifyAccountToken(authorization: string | null) {
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [row] = await getDb()
    .select({ userId: accountMcpTokens.userId })
    .from(accountMcpTokens)
    .where(eq(accountMcpTokens.tokenHash, tokenHash));
  return row?.userId || null;
}
// Resolve on every call: never remember a previous project's selection.
export async function resolveMcpProject(userId: string, projectId?: string) {
  if (projectId) return getOwnedProject(userId, projectId);
  const projects = await listProjects(userId);
  if (!projects.length)
    throw new Error(
      "No projects found. Create a project in PostDispatch first.",
    );
  if (projects.length !== 1)
    throw new Error(
      "projectId is required when your account has multiple projects. Call list_projects and pass the intended project's ID.",
    );
  return getOwnedProject(userId, projects[0].id);
}
