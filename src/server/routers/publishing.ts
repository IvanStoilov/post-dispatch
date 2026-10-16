import {
  deletePublication,
  editPublication,
  listPublications,
  publishPost,
  refreshPublication,
  retryPublication,
} from "@/domain/publishing";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/publishing.ts; access is
// enforced by the domain, scoped to context.actor.
export const publishingRouter = {
  publish: authed.publishing.publish.handler(({ context, input }) =>
    publishPost(context.actor, input),
  ),
  retry: authed.publishing.retry.handler(({ context, input }) =>
    retryPublication(context.actor, input),
  ),
};

export const publicationsRouter = {
  list: authed.publications.list.handler(({ context, input }) =>
    listPublications(context.actor, input),
  ),
  refresh: authed.publications.refresh.handler(({ context, input }) =>
    refreshPublication(context.actor, input),
  ),
  edit: authed.publications.edit.handler(({ context, input }) =>
    editPublication(context.actor, input),
  ),
  delete: authed.publications.delete.handler(({ context, input }) =>
    deletePublication(context.actor, input),
  ),
};
