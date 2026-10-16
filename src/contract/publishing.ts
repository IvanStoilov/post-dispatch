import { z } from "zod";
import { postDto } from "@/shared/schemas/post";
import { publicationDto } from "@/shared/schemas/publication";
import {
  editPublicationInput,
  listPublicationsInput,
  publicationRef,
  publishPostInput,
} from "@/shared/schemas/publishing";
import { base } from "./base";

// Publishing a post (202: delivery continues after the response).
export const publishingContract = {
  publish: base
    .route({
      method: "POST",
      path: "/projects/{projectId}/posts/{id}/publish",
      successStatus: 202,
    })
    .input(publishPostInput)
    .output(postDto),
  retry: base
    .route({
      method: "POST",
      path: "/projects/{projectId}/posts/{id}/retry",
      successStatus: 202,
    })
    .input(publishPostInput)
    .output(z.void()),
};

// A post's published copies on the networks.
export const publicationsContract = {
  list: base
    .route({ method: "GET", path: "/projects/{projectId}/publications" })
    .input(listPublicationsInput)
    .output(z.array(publicationDto)),
  refresh: base
    .route({
      method: "POST",
      path: "/projects/{projectId}/publications/{id}/refresh",
    })
    .input(publicationRef)
    .output(publicationDto),
  edit: base
    .route({ method: "PATCH", path: "/projects/{projectId}/publications/{id}" })
    .input(editPublicationInput)
    .output(publicationDto),
  delete: base
    .route({
      method: "DELETE",
      path: "/projects/{projectId}/publications/{id}",
    })
    .input(publicationRef)
    .output(publicationDto),
};
