import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { z } from "zod";
import { getAuth } from "./auth";
import { appPageUrl } from "./origins";
import { projectsService } from "@/domain/projects";
import { UserFacingError } from "@/domain/shared/errors";

export async function getSession() {
  return await getAuth().api.getSession({ headers: await headers() });
}

export async function workspaceSession() {
  const session = await getSession();
  if (!session) redirect(appPageUrl("/signin"));
  return session;
}
export async function requireProject(projectId: string) {
  const session = await workspaceSession();
  if (!z.uuid().safeParse(projectId).success) notFound();
  try {
    await projectsService.get({ userId: session.user.id }, { id: projectId });
  } catch (error) {
    if (error instanceof UserFacingError && error.status === 404) notFound();
    throw error;
  }
  return session;
}
