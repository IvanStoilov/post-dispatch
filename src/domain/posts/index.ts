import "server-only";

// Public API of the posts module: user use cases that take an Actor and
// return DTOs. Workers and other modules use ./system instead.
export { createPost, deletePost, listPosts, updatePost } from "./service";
