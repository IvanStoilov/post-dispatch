import { z } from "zod";

// Inputs and DTOs for assistant (MCP) access to the account. Browser-safe.

export const assistantGrantRef = z.object({
  clientId: z.string().min(1).max(2048),
});
export type AssistantGrantRef = z.output<typeof assistantGrantRef>;

// An OAuth client the user allowed to act on the account.
export const assistantGrantDto = z.object({
  clientId: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
});

export const assistantAccessDto = z.object({
  // Whether an account MCP token exists. The token itself is shown once.
  configured: z.boolean(),
  grants: z.array(assistantGrantDto),
});
export type AssistantAccessDto = z.output<typeof assistantAccessDto>;

export const assistantTokenDto = z.object({ mcpToken: z.string() });
export type AssistantTokenDto = z.output<typeof assistantTokenDto>;
