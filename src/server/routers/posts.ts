import { createPost, deletePost, listPosts, updatePost } from "@/domain/posts";
import { authed } from "../orpc";

// Routes, input and output come from src/contract/posts.ts; access is
// enforced by the domain, scoped to context.actor.
export const postsRouter = {
  list: authed.posts.list.handler(({ context, input }) =>
    listPosts(context.actor, input),
  ),
  create: authed.posts.create.handler(({ context, input }) =>
    createPost(context.actor, input),
  ),
  update: authed.posts.update.handler(({ context, input }) =>
    updatePost(context.actor, input),
  ),
  delete: authed.posts.delete.handler(({ context, input }) =>
    deletePost(context.actor, input),
  ),
};
