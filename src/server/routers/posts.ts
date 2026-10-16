import { postsService } from "@/domain/posts";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/posts.ts; access is
// enforced by the domain, scoped to context.actor.
export const postsRouter = {
  list: authed.posts.list.handler(({ context, input }) =>
    postsService.list(context.actor, input),
  ),
  create: authed.posts.create.handler(({ context, input }) =>
    postsService.create(context.actor, input),
  ),
  update: authed.posts.update.handler(({ context, input }) =>
    postsService.update(context.actor, input),
  ),
  delete: authed.posts.delete.handler(({ context, input }) =>
    postsService.delete(context.actor, input),
  ),
};
