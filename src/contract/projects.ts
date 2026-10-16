import { z } from "zod";
import {
  createProjectInput,
  deleteProjectInput,
  disconnectChannelInput,
  projectDto,
  updateProjectInput,
} from "@/shared/schemas/project";
import { base } from "./base";

// Routes for projects. Inputs and outputs are the shared zod DTOs; outputs
// are checked at runtime, and keys not in a DTO (like tokens) are dropped.
export const projectsContract = {
  list: base
    .route({ method: "GET", path: "/projects" })
    .output(z.array(projectDto)),
  create: base
    .route({ method: "POST", path: "/projects", successStatus: 201 })
    .input(createProjectInput)
    .output(projectDto),
  update: base
    .route({ method: "PUT", path: "/projects/{id}" })
    .input(updateProjectInput)
    .output(projectDto),
  delete: base
    .route({ method: "DELETE", path: "/projects/{id}" })
    .input(deleteProjectInput)
    .output(z.void()),
  disconnectChannel: base
    .route({ method: "DELETE", path: "/projects/{id}/channels/{provider}" })
    .input(disconnectChannelInput)
    .output(z.void()),
};
