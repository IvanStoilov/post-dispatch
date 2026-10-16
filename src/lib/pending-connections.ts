import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { inArray, like } from "drizzle-orm";
import type { getDb } from "../db";
import { verifications } from "../db/schema";
import { config } from "./config";
import type { LinkedInAccount } from "./connectors/linkedin";
import type { Platform } from "./types";

// Connect flows keep their in-progress state (who, which project, the
// accounts offered) sealed in a verification row until the user finishes.
// Separate from connector-connect so deletion can clean these up without
// importing the connect flows.

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
export type PendingConnection = {
  userId: string;
  projectId: string;
  provider: Platform;
  sessionId: string;
  phase: "authorize" | "select";
  pages?: {
    id: string;
    name: string;
    access_token: string;
    tasks?: string[];
  }[];
  linkedin?: LinkedInAccount[];
};

function key() {
  if (!config.BETTER_AUTH_SECRET)
    throw new Error("BETTER_AUTH_SECRET is required");
  return (
    createHash("sha256")
      // Preserve the context so in-flight connector handshakes survive the rebrand.
      .update(`postdispatch-meta:${config.BETTER_AUTH_SECRET}`)
      .digest()
  );
}

export function sealPending(value: PendingConnection) {
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

export function unsealPending(value: string): PendingConnection {
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

export function pendingConnectionBelongsTo(
  value: string,
  userId: string,
  projectId?: string,
) {
  try {
    const pending = unsealPending(value);
    return (
      pending.userId === userId &&
      (projectId === undefined || pending.projectId === projectId)
    );
  } catch {
    return false;
  }
}

// Removes the user's unfinished connect flows for the project.
export async function deletePendingConnections(
  tx: Tx,
  userId: string,
  projectId: string,
) {
  const pending = await tx
    .select()
    .from(verifications)
    .where(like(verifications.identifier, "meta-connect:%"));
  const ids = pending
    .filter((record) =>
      pendingConnectionBelongsTo(record.value, userId, projectId),
    )
    .map((record) => record.id);
  if (ids.length)
    await tx.delete(verifications).where(inArray(verifications.id, ids));
}
