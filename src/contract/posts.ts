import { z } from "zod";
import { base } from "./base";
import {
  createPostInput,
  listPostsInput,
  postDto,
  postRef,
  updatePostInput,
} from "@/shared/schemas/post";

// Routes for a project's posts. Publishing (publish, retry) is not here
// yet; it moves with the publishing module.
export const postsContract = {
  list: base
    .route({ method: "GET", path: "/projects/{projectId}/posts" })
    .input(listPostsInput)
    .output(z.array(postDto)),
  create: base
    .route({
      method: "POST",
      path: "/projects/{projectId}/posts",
      successStatus: 201,
    })
    .input(createPostInput)
    .output(postDto),
  update: base
    .route({ method: "PUT", path: "/projects/{projectId}/posts/{id}" })
    .input(updatePostInput)
    .output(postDto),
  delete: base
    .route({ method: "DELETE", path: "/projects/{projectId}/posts/{id}" })
    .input(postRef)
    .output(z.void()),
};
