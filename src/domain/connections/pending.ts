import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "@/lib/config";
import type { LinkedInAccount } from "@/lib/connectors/linkedin";
import type { MetaPage } from "@/lib/connectors/meta-oauth";
import type { Platform } from "@/shared/platforms";

// A connect flow in progress: who started it, from which session, for
// which project, and (once the provider answered) the accounts offered.
// Stored sealed: offered accounts carry access tokens.
export type PendingConnection = {
  userId: string;
  projectId: string;
  provider: Platform;
  sessionId: string;
  phase: "authorize" | "select";
  pages?: MetaPage[];
  linkedin?: LinkedInAccount[];
};

export const PENDING_LIFETIME_SECONDS = 10 * 60;

function key() {
  if (!config.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required");
  }
  return (
    createHash("sha256")
      // Preserve the context so in-flight connector handshakes survive the rebrand.
      .update(`postdispatch-meta:${config.BETTER_AUTH_SECRET}`)
      .digest()
  );
}

export function seal(value: PendingConnection) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const content = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), content]).toString(
    "base64url",
  );
}

export function unseal(value: string): PendingConnection {
  const bytes = Buffer.from(value, "base64url");
  const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString(),
  );
}

export function belongsTo(value: string, userId: string, projectId?: string) {
  try {
    const pending = unseal(value);
    return (
      pending.userId === userId &&
      (projectId === undefined || pending.projectId === projectId)
    );
  } catch {
    return false;
  }
}
