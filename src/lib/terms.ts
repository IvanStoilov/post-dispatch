import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { site } from "./public-site";

// Bump this version whenever the Markdown or operator details change.
export const TERMS_VERSION = "2026-10-15.3";
export const TERMS_REVIEW_NOTICE =
  "Draft legal text — professional legal review required before production use.";
export function currentTerms() {
  const template = readFileSync(
    join(process.cwd(), "src/content/legal/terms.md"),
    "utf8",
  );
  const values: Record<string, string> = {
    version: TERMS_VERSION,
    reviewNotice: TERMS_REVIEW_NOTICE,
    operator: site.operator,
    taxId: site.taxId,
    address: site.address,
    email: site.email,
  };
  const content = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!(key in values)) throw new Error(`Unknown terms placeholder: ${key}`);
    return values[key];
  });
  return {
    version: TERMS_VERSION,
    content,
    hash: createHash("sha256").update(content, "utf8").digest("hex"),
  };
}
