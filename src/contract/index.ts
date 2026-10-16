import { postsContract } from "./posts";
import { projectsContract } from "./projects";
import { publicationsContract, publishingContract } from "./publishing";

// The REST API served at /api/v1, shared by server and browser. Keep this
// directory free of server imports: it ships in the client bundle.
export const contract = {
  projects: projectsContract,
  posts: postsContract,
  publishing: publishingContract,
  publications: publicationsContract,
};
export type Contract = typeof contract;
