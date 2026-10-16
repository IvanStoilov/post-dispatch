import { postsContract } from "./posts";
import { projectsContract } from "./projects";

// The REST API served at /api/v1, shared by server and browser. Keep this
// directory free of server imports: it ships in the client bundle.
export const contract = {
  projects: projectsContract,
  posts: postsContract,
};
export type Contract = typeof contract;
