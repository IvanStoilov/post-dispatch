import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { getAuth } from "./auth";
import { appPageUrl } from "./origins";
import { getOwnedProject } from "./projects";
export async function workspaceSession() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect(appPageUrl("/signin"));
  return session;
}
export async function requireProject(projectId: string) {
  const session = await workspaceSession();
  if (!z.uuid().safeParse(projectId).success) notFound();
  try {
    await getOwnedProject(session.user.id, projectId);
  } catch (error) {
    if (error instanceof Error && error.message === "Project not found")
      notFound();
    throw error;
  }
  return session;
}
