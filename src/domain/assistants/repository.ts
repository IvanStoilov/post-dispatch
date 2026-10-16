import "server-only";
import { and, arrayContains, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accountMcpTokens,
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from "@/db/schema";

// Every query on assistant access: the account MCP token (stored as a
// hash) and OAuth consents and tokens for the account resource.

export async function upsertToken(userId: string, tokenHash: string) {
  await getDb()
    .insert(accountMcpTokens)
    .values({ userId, tokenHash })
    .onConflictDoUpdate({
      target: accountMcpTokens.userId,
      set: { tokenHash, updatedAt: new Date() },
    });
}

export async function findUserByTokenHash(tokenHash: string) {
  const [row] = await getDb()
    .select({ userId: accountMcpTokens.userId })
    .from(accountMcpTokens)
    .where(eq(accountMcpTokens.tokenHash, tokenHash));
  return row?.userId;
}

export async function hasToken(userId: string) {
  const [row] = await getDb()
    .select({ userId: accountMcpTokens.userId })
    .from(accountMcpTokens)
    .where(eq(accountMcpTokens.userId, userId));
  return !!row;
}

export function listConsents(userId: string, resource: string) {
  return getDb()
    .select({
      clientId: oauthConsents.clientId,
      name: oauthClients.name,
      scopes: oauthConsents.scopes,
    })
    .from(oauthConsents)
    .leftJoin(oauthClients, eq(oauthConsents.clientId, oauthClients.clientId))
    .where(
      and(
        eq(oauthConsents.userId, userId),
        arrayContains(oauthConsents.resources, [resource]),
      ),
    );
}

// Revokes the client's tokens and removes its consent, so it must ask the
// user again.
export async function revokeClient(
  userId: string,
  clientId: string,
  resource: string,
) {
  await getDb().transaction(async (tx) => {
    for (const table of [oauthAccessTokens, oauthRefreshTokens]) {
      await tx
        .update(table)
        .set({ revoked: new Date() })
        .where(
          and(
            eq(table.userId, userId),
            eq(table.clientId, clientId),
            arrayContains(table.resources, [resource]),
          ),
        );
    }
    await tx
      .delete(oauthConsents)
      .where(
        and(
          eq(oauthConsents.userId, userId),
          eq(oauthConsents.clientId, clientId),
          arrayContains(oauthConsents.resources, [resource]),
        ),
      );
  });
}
