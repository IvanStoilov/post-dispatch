import { publishingService } from "@/domain/publishing";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/publishing.ts; access is
// enforced by the domain, scoped to context.actor.
export const publishingRouter = {
  publish: authed.publishing.publish.handler(({ context, input }) =>
    publishingService.publish(context.actor, input),
  ),
  retry: authed.publishing.retry.handler(({ context, input }) =>
    publishingService.retry(context.actor, input),
  ),
};

export const publicationsRouter = {
  list: authed.publications.list.handler(({ context, input }) =>
    publishingService.listPublications(context.actor, input),
  ),
  refresh: authed.publications.refresh.handler(({ context, input }) =>
    publishingService.refreshPublication(context.actor, input),
  ),
  edit: authed.publications.edit.handler(({ context, input }) =>
    publishingService.editPublication(context.actor, input),
  ),
  delete: authed.publications.delete.handler(({ context, input }) =>
    publishingService.deletePublication(context.actor, input),
  ),
};
