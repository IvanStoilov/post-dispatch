import { z } from "zod";
import {
  projectsService as projects,
  projectsSystemService as system,
  type ConnectorValues,
} from "@/domain/projects";
import { UserFacingError } from "@/domain/shared/errors";
import { projectFields } from "@/shared/schemas/project";
import type { Platform } from "./types";

// Deprecated adapter: keeps the old signatures for code not yet migrated to
// src/domain/projects. New code imports the domain module directly. Remove
// each function when its last caller has migrated.

export const projectSchema = projectFields;
export type { ProjectRecord as ConnectedProject } from "@/domain/projects";
export const isConnected = system.isConnected;

async function found<T>(record: Promise<T | undefined>) {
  const value = await record;
  if (!value) throw new UserFacingError("Project not found", 404);
  return value;
}

export async function getProject(id: string) {
  return found(system.findRecord(z.uuid().parse(id)));
}

export async function getOwnedProject(userId: string, id: string) {
  return found(system.findOwnedRecord(userId, z.uuid().parse(id)));
}

export async function listProjects(userId: string) {
  return projects.list({ userId });
}

export async function createProject(userId: string, input: unknown) {
  const values = projectFields.parse(input);
  const created = await projects.create({ userId }, values);
  const project = await projects.update(
    { userId },
    { ...values, id: created.id },
  );
  return { project };
}

export async function updateProject(
  userId: string,
  id: string,
  input: unknown,
) {
  return projects.update(
    { userId },
    { ...projectFields.parse(input), id: z.uuid().parse(id) },
  );
}

export async function saveConnector(
  userId: string,
  projectId: string,
  values: ConnectorValues,
) {
  return system.saveConnector(userId, projectId, values);
}

export async function disconnectConnector(
  userId: string,
  projectId: string,
  provider: Platform,
) {
  return projects.disconnectChannel({ userId }, { id: projectId, provider });
}
