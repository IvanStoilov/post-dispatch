import { z } from "zod";
import {
  assistantAccessDto,
  assistantGrantRef,
  assistantTokenDto,
} from "@/shared/schemas/assistants";
import {
  acceptTermsInput,
  termsAcceptanceDto,
  termsAcceptanceRef,
  termsAcceptanceSummaryDto,
} from "@/shared/schemas/terms";
import { base } from "./base";

// The signed-in user's account settings. Account deletion is a plain route
// (/api/account): it re-checks the password and clears session cookies.

// Terms of Service acceptances, kept as evidence.
export const termsContract = {
  listAcceptances: base
    .route({ method: "GET", path: "/account/terms" })
    .output(z.array(termsAcceptanceSummaryDto)),
  accept: base
    .route({ method: "POST", path: "/account/terms" })
    .input(acceptTermsInput)
    .output(z.void()),
  getAcceptance: base
    .route({ method: "GET", path: "/account/terms/{id}" })
    .input(termsAcceptanceRef)
    .output(termsAcceptanceDto),
};

// Assistants (MCP clients) allowed to act on the account.
export const assistantsContract = {
  get: base
    .route({ method: "GET", path: "/account/assistants" })
    .output(assistantAccessDto),
  rotateToken: base
    .route({ method: "POST", path: "/account/assistants/token" })
    .output(assistantTokenDto),
  revokeGrant: base
    .route({
      method: "DELETE",
      path: "/account/assistants/grants/{clientId}",
    })
    .input(assistantGrantRef)
    .output(z.void()),
};
