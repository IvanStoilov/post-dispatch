import { loggedOperation } from "./logger";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { accountMcpTokens } from "../db/schema";
export async function accountTokenConfigured(userId: string) {
  return loggedOperation(
    "lib.mcp-account.accountTokenConfigured",
    { userId },
    async () => {
      const [row] = await getDb()
        .select({ userId: accountMcpTokens.userId })
        .from(accountMcpTokens)
        .where(eq(accountMcpTokens.userId, userId));
      return !!row;
    },
  );
}
export async function rotateAccountToken(userId: string) {
  return loggedOperation(
    "lib.mcp-account.rotateAccountToken",
    { userId },
    async () => {
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
    },
  );
}
export async function verifyAccountToken(authorization: string | null) {
  return loggedOperation("lib.mcp-account.verifyAccountToken", {}, async () => {
    const token = authorization?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return null;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const [row] = await getDb()
      .select({ userId: accountMcpTokens.userId })
      .from(accountMcpTokens)
      .where(eq(accountMcpTokens.tokenHash, tokenHash));
    return row?.userId || null;
  });
}
