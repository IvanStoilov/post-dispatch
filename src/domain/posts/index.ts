import "server-only";

// Public API of the posts module. postsSystemService skips user
// authorization: only workers and other domain modules may use it.
export { postsService, postsSystemService } from "./service";
export type { PostRecord } from "./types";
