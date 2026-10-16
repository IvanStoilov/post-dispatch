import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Actor } from "../shared/actor";
import * as repository from "./repository";
import { loggedOperation } from "@/lib/logger";
import { accountResource } from "@/lib/oauth-provider";
import type {
  AssistantAccessDto,
  AssistantGrantRef,
  AssistantTokenDto,
} from "@/shared/schemas/assistants";

// Which assistants may act on the account over MCP: the account MCP token
// (one per user, shown once, stored hashed) and OAuth clients the user
// approved for the account resource.

const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

async function getAccess(actor: Actor): Promise<AssistantAccessDto> {
  const consents = await repository.listConsents(
    actor.userId,
    accountResource(),
  );
  // One entry per client, even with several consents.
  const grants = new Map(
    consents.map((row) => [
      row.clientId,
      { ...row, name: row.name || "MCP client" },
    ]),
  );
  return {
    configured: await repository.hasToken(actor.userId),
    grants: [...grants.values()],
  };
}

// Replaces the account MCP token; the old one stops working.
async function rotateToken(actor: Actor): Promise<AssistantTokenDto> {
  return loggedOperation("domain.assistants.rotateToken", actor, async () => {
    const token = randomBytes(32).toString("base64url");
    await repository.upsertToken(actor.userId, hash(token));
    return { mcpToken: token };
  });
}

async function revokeGrant(
  actor: Actor,
  { clientId }: AssistantGrantRef,
): Promise<void> {
  return loggedOperation("domain.assistants.revokeGrant", actor, () =>
    repository.revokeClient(actor.userId, clientId, accountResource()),
  );
}

// Capability use case: the user an account MCP token belongs to, from an
// Authorization header; null when missing or unknown. The MCP transport
// authenticates with it.
async function verifyToken(authorization: string | null) {
  const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) {
    return null;
  }
  return (await repository.findUserByTokenHash(hash(token))) ?? null;
}

// For routers, pages and MCP tools acting for a signed-in user.
export const assistantsService = {
  getAccess,
  rotateToken,
  revokeGrant,
  verifyToken,
};

// For workers and other domain modules only: these skip user
// authorization. Lint forbids them in routers and UI.
export const assistantsSystemService = {
  // Whether the user has an account MCP token, by user ID.
  hasToken: repository.hasToken,
};
