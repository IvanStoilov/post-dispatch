import { z } from "zod";

// Inputs and DTOs for the Terms of Service. Browser-safe.

// The terms the user read: accepting checks they are still current.
export const acceptTermsInput = z
  .object({
    termsAccepted: z.literal(true),
    termsVersion: z.string().max(100),
    termsHash: z.string().max(100),
  })
  .strict();
export type AcceptTermsInput = z.output<typeof acceptTermsInput>;

export const termsAcceptanceRef = z.object({ id: z.uuid() });
export type TermsAcceptanceRef = z.output<typeof termsAcceptanceRef>;

export const termsDto = z.object({
  version: z.string(),
  content: z.string(),
  hash: z.string(),
});
export type TermsDto = z.output<typeof termsDto>;

export const termsAcceptanceSummaryDto = z.object({
  id: z.uuid(),
  termsVersion: z.string(),
  acceptedAt: z.iso.datetime(),
});
export type TermsAcceptanceSummaryDto = z.output<
  typeof termsAcceptanceSummaryDto
>;

// The exact text the user accepted, as evidence.
export const termsAcceptanceDto = termsAcceptanceSummaryDto.extend({
  termsContent: z.string(),
  termsHash: z.string(),
  acceptanceSource: z.string(),
});
export type TermsAcceptanceDto = z.output<typeof termsAcceptanceDto>;
