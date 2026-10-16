import "server-only";
import { loggedOperation } from "@/lib/logger";
import type {
  AcceptTermsInput,
  TermsAcceptanceDto,
  TermsAcceptanceRef,
  TermsAcceptanceSummaryDto,
  TermsDto,
} from "@/shared/schemas/terms";
import type { Actor } from "../shared/actor";
import { UserFacingError } from "../shared/errors";
import { currentTerms } from "./document";
import * as repository from "./repository";

// The Terms of Service and the evidence of each user's acceptance: the
// exact text, its version and hash, when, and from where. Accepting is only
// valid for the terms the user was shown, so a changed text needs a new
// review.

type Check =
  { status: "accepted"; terms: TermsDto } | { status: "required" | "changed" };

// Whether the submitted acceptance is for the current terms.
function check(input: {
  termsAccepted?: unknown;
  termsVersion?: unknown;
  termsHash?: unknown;
}): Check {
  const terms = currentTerms();
  if (input.termsAccepted !== true) return { status: "required" };
  if (input.termsVersion !== terms.version || input.termsHash !== terms.hash)
    return { status: "changed" };
  return { status: "accepted", terms };
}

// Public: the current terms, for the terms and signup pages.
function current(): TermsDto {
  return currentTerms();
}

async function accept(actor: Actor, input: AcceptTermsInput): Promise<void> {
  return loggedOperation("domain.terms.accept", actor, async () => {
    const result = check(input);
    if (result.status !== "accepted")
      throw new UserFacingError(
        "Review and accept the current Terms of Service. Reload if they have changed.",
        400,
      );
    await repository.insertAcceptance({
      userId: actor.userId,
      termsVersion: result.terms.version,
      termsContent: result.terms.content,
      termsHash: result.terms.hash,
      acceptanceSource: "account",
    });
  });
}

async function listAcceptances(
  actor: Actor,
): Promise<TermsAcceptanceSummaryDto[]> {
  return (await repository.listByUser(actor.userId)).map((record) => ({
    ...record,
    acceptedAt: record.acceptedAt.toISOString(),
  }));
}

async function getAcceptance(
  actor: Actor,
  { id }: TermsAcceptanceRef,
): Promise<TermsAcceptanceDto> {
  const record = await repository.findOwned(actor.userId, id);
  if (!record) throw new UserFacingError("Agreement not found", 404);
  return {
    id: record.id,
    termsVersion: record.termsVersion,
    termsContent: record.termsContent,
    termsHash: record.termsHash,
    acceptanceSource: record.acceptanceSource,
    acceptedAt: record.acceptedAt.toISOString(),
  };
}

// For routers, pages and MCP tools acting for a signed-in user.
export const termsService = {
  current,
  accept,
  listAcceptances,
  getAcceptance,
};

// For auth and other domain modules only. Signup records its evidence in
// the auth library's own transaction (src/lib/auth.ts), after this check.
export const termsSystemService = { check };
