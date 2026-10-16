import { pub } from "./orpc";
import { assistantsRouter, termsRouter } from "./routers/account";
import { postsRouter } from "./routers/posts";
import { projectsRouter } from "./routers/projects";
import { publicationsRouter, publishingRouter } from "./routers/publishing";
import { uploadsRouter } from "./routers/uploads";

// Served as REST at /api/v1. router() checks every procedure against the
// contract, so a missing or mismatched implementation is a type error.
export const router = pub.router({
  projects: projectsRouter,
  posts: postsRouter,
  publishing: publishingRouter,
  publications: publicationsRouter,
  uploads: uploadsRouter,
  terms: termsRouter,
  assistants: assistantsRouter,
});
export type Router = typeof router;
