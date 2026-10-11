import { config } from "./config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const CREDENTIAL_PREFIX = "pdcred:v1:";
export type CredentialField = "access_token" | "refresh_token";

function encryptionKey(): Buffer {
  const value = config.CREDENTIALS_ENCRYPTION_KEY;
  if (!value || !/^[a-f\d]{64}$/i.test(value))
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hexadecimal key (64 characters).",
    );
  return Buffer.from(value, "hex");
}

export function encryptCredential(
  value: string,
  field: CredentialField,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`postdispatch:project_connectors:${field}:v1`));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return (
    CREDENTIAL_PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")
  );
}

export function decryptCredential(
  value: string,
  field: CredentialField,
): string {
  // Fail closed: plaintext, unsupported formats, wrong keys and tampering never
  // silently become credentials that could be sent to a social provider.
  const key = encryptionKey();
  if (!value.startsWith(CREDENTIAL_PREFIX))
    throw new Error(
      "Stored connector credentials must be migrated to the encrypted format.",
    );
  const encoded = value.slice(CREDENTIAL_PREFIX.length);
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.length < 28 || bytes.toString("base64url") !== encoded)
    throw new Error("Stored connector credential is invalid.");
  try {
    const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(`postdispatch:project_connectors:${field}:v1`));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Stored connector credential could not be decrypted. Check the encryption key and data integrity.",
    );
  }
}
