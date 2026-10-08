import { customType } from "drizzle-orm/pg-core";
import {
  encryptCredential,
  decryptCredential,
  type CredentialField,
} from "../lib/credential-encryption";

/** All Drizzle paths, including direct inserts and conflict updates, are protected. */
export function encryptedToken(field: CredentialField) {
  return customType<{ data: string; driverData: string }>({
    dataType: () => "text",
    toDriver: (value) => encryptCredential(value, field),
    fromDriver: (value) => decryptCredential(value, field),
  })(field);
}
