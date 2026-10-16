import { loggedRequest } from "@/lib/logger";
import { updateProject } from "@/lib/projects";
import { authenticated, ownedProject } from "@/lib/api-auth";
import { z } from "zod";
import { appOrigin } from "@/lib/origins";
import { readBody } from "@/lib/request-body";
import { DataDeletionError } from "@/lib/project-deletion";
import { deleteProject } from "@/lib/delete-project";
import { logger } from "@/lib/logger";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return loggedRequest(req, "/api/projects/[id]", async () => {
    return authenticated(req, async (userId) => {
      const id = await ownedProject(req, userId, (await ctx.params).id);
      try {
        return Response.json(await updateProject(userId, id, await req.json()));
      } catch {
        return Response.json(
          { error: "Could not update project configuration" },
          { status: 400 },
        );
      }
    });
  });
}
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return loggedRequest(req, "/api/projects/[id]", async () => {
    if (req.headers.get("origin") !== appOrigin())
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    return authenticated(req, async (userId) => {
      const id = await ownedProject(req, userId, (await ctx.params).id);
      let confirmation: string;
      try {
        ({ confirmation } = z
          .object({ confirmation: z.string().min(1).max(120) })
          .strict()
          .parse(
            JSON.parse(
              (await readBody(req, 4096, "Project deletion request")).toString(
                "utf8",
              ),
            ),
          ));
      } catch {
        return Response.json(
          { error: "Enter the project name to confirm deletion." },
          { status: 400 },
        );
      }
      try {
        await deleteProject(userId, id, confirmation);
      } catch (error) {
        logger.warn("project.deletion.rejected", {
          userId,
          projectId: id,
          error,
        });
        return Response.json(
          {
            error:
              error instanceof DataDeletionError
                ? error.message
                : "The project could not be deleted. Please try again or contact support.",
          },
          { status: error instanceof DataDeletionError ? error.status : 503 },
        );
      }
      return Response.json({ deleted: true });
    });
  });
}
