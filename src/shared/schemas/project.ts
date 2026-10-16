import { z } from "zod";
import { platforms } from "../platforms";

// Inputs and DTOs for projects. Shared by the contract, the domain and the
// browser, so this file must never import server code.

export const instagramApiHosts = [
  "graph.facebook.com",
  "graph.instagram.com",
] as const;
const projectId = z.uuid();
const projectName = z.string().trim().min(1).max(120);

// Editable project settings; also the shape of legacy create/update bodies.
export const projectFields = z.object({
  name: projectName,
  facebookPageId: z.string().trim().max(100).optional(),
  facebookPageToken: z.string().trim().max(4096).optional(),
  instagramAccountId: z.string().trim().max(100).optional(),
  instagramAccessToken: z.string().trim().max(4096).optional(),
  instagramApiHost: z.enum(instagramApiHosts).optional(),
});
export type ProjectFields = z.output<typeof projectFields>;

export const projectRef = z.object({ id: projectId });
export type ProjectRef = z.output<typeof projectRef>;

export const createProjectInput = z.object({ name: projectName });
export type CreateProjectInput = z.output<typeof createProjectInput>;

export const updateProjectInput = projectFields.extend({ id: projectId });
export type UpdateProjectInput = z.output<typeof updateProjectInput>;

export const deleteProjectInput = z.object({
  id: projectId,
  confirmation: z.string().min(1).max(120),
});
export type DeleteProjectInput = z.output<typeof deleteProjectInput>;

export const disconnectChannelInput = z.object({
  id: projectId,
  provider: z.enum(platforms),
});
export type DisconnectChannelInput = z.output<typeof disconnectChannelInput>;

export const connectionSummaryDto = z.object({
  accountId: z.string(),
  accountName: z.string(),
  accountUrl: z.string().nullable().optional(),
  configured: z.boolean(),
  expiresAt: z.iso.datetime().nullable(),
});
export type ConnectionSummaryDto = z.output<typeof connectionSummaryDto>;

// What clients see of a project. Never includes access tokens.
export const projectDto = z.object({
  id: projectId,
  name: z.string(),
  facebookPageId: z.string(),
  instagramAccountId: z.string(),
  instagramApiHost: z.enum(instagramApiHosts),
  facebookConfigured: z.boolean(),
  instagramConfigured: z.boolean(),
  connectors: z
    .partialRecord(z.enum(platforms), connectionSummaryDto)
    .optional(),
});
export type ProjectDto = z.output<typeof projectDto>;
