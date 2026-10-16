import { authed } from "../orpc";
import { assistantsService } from "@/domain/assistants";
import { termsService } from "@/domain/terms";

// Routes, input and output come from src/contract/account.ts; access is
// enforced by the domain, scoped to context.actor.
export const termsRouter = {
  listAcceptances: authed.terms.listAcceptances.handler(({ context }) =>
    termsService.listAcceptances(context.actor),
  ),
  accept: authed.terms.accept.handler(({ context, input }) =>
    termsService.accept(context.actor, input),
  ),
  getAcceptance: authed.terms.getAcceptance.handler(({ context, input }) =>
    termsService.getAcceptance(context.actor, input),
  ),
};

export const assistantsRouter = {
  get: authed.assistants.get.handler(({ context }) =>
    assistantsService.getAccess(context.actor),
  ),
  rotateToken: authed.assistants.rotateToken.handler(({ context }) =>
    assistantsService.rotateToken(context.actor),
  ),
  revokeGrant: authed.assistants.revokeGrant.handler(({ context, input }) =>
    assistantsService.revokeGrant(context.actor, input),
  ),
};
