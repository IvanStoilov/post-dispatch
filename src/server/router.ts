import { pub } from "./orpc";
import { postsRouter } from "./routers/posts";
import { projectsRouter } from "./routers/projects";

// Served as REST at /api/v1. router() checks every procedure against the
// contract, so a missing or mismatched implementation is a type error.
export const router = pub.router({
  projects: projectsRouter,
  posts: postsRouter,
});
export type Router = typeof router;
