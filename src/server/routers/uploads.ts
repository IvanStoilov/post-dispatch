import { uploadsService } from "@/domain/uploads";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/uploads.ts; access is
// enforced by the domain, scoped to context.actor.
export const uploadsRouter = {
  start: authed.uploads.start.handler(({ context, input }) =>
    uploadsService.start(context.actor, input),
  ),
  complete: authed.uploads.complete.handler(({ context, input }) =>
    uploadsService.complete(context.actor, input),
  ),
};
