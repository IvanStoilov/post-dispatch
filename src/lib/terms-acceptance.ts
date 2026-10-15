import { APIError } from "better-auth/api";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { termsAcceptances } from "@/db/schema";
import { currentTerms } from "./terms";

export function validateTermsAcceptance(
  body: Record<string, unknown> | undefined,
) {
  const terms = currentTerms();
  if (body?.termsAccepted !== true)
    throw new APIError("BAD_REQUEST", {
      code: "TERMS_ACCEPTANCE_REQUIRED",
      message: "You must read and agree to Ramblo's Terms of Service.",
    });
  if (body.termsVersion !== terms.version || body.termsHash !== terms.hash)
    throw new APIError("BAD_REQUEST", {
      code: "TERMS_VERSION_CHANGED",
      message:
        "The Terms of Service have changed. Reload this page and review them before accepting.",
    });
  return terms;
}
export async function listTermsAcceptances(userId: string) {
  return getDb()
    .select({
      id: termsAcceptances.id,
      termsVersion: termsAcceptances.termsVersion,
      acceptedAt: termsAcceptances.acceptedAt,
    })
    .from(termsAcceptances)
    .where(eq(termsAcceptances.userId, userId))
    .orderBy(desc(termsAcceptances.acceptedAt));
}
export async function getOwnTermsAcceptance(userId: string, id: string) {
  const [record] = await getDb()
    .select()
    .from(termsAcceptances)
    .where(
      and(eq(termsAcceptances.userId, userId), eq(termsAcceptances.id, id)),
    );
  return record;
}
