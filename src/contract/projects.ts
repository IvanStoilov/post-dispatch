import { type } from "@orpc/contract";
import { z } from "zod";
import { projectSchema } from "@/lib/schemas/project";
import { platforms, type Project } from "@/lib/types";
import { base } from "./base";

const projectId = z.uuid();

export const projectsContract = {
  list: base
    .route({ method: "GET", path: "/projects" })
    .output(type<Project[]>()),
  create: base
    .route({ method: "POST", path: "/projects", successStatus: 201 })
    .input(z.object({ name: projectSchema.shape.name }))
    .output(type<Project>()),
  update: base
    .route({ method: "PUT", path: "/projects/{id}" })
    .input(projectSchema.extend({ id: projectId }))
    .output(type<Project>()),
  delete: base
    .route({ method: "DELETE", path: "/projects/{id}" })
    .input(
      z.object({ id: projectId, confirmation: z.string().min(1).max(120) }),
    )
    .output(type<void>()),
  disconnectChannel: base
    .route({ method: "DELETE", path: "/projects/{id}/channels/{provider}" })
    .input(z.object({ id: projectId, provider: z.enum(platforms) }))
    .output(type<void>()),
};
