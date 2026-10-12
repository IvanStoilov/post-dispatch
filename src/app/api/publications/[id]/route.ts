import { authenticated, ownedProject } from "@/lib/api-auth";
import { managePublication, PublicationError } from "@/lib/publications";
import { loggedRequest, logger } from "@/lib/logger";
import { readBody } from "@/lib/request-body";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
function handle(
  req: Request,
  ctx: Context,
  action: "refresh" | "edit" | "delete",
) {
  return loggedRequest(req, "/api/publications/[id]", () =>
    authenticated(req, async (userId) => {
      const projectId = await ownedProject(req, userId);
      try {
        const id = (await ctx.params).id;
        if (!z.uuid().safeParse(id).success)
          return Response.json(
            { error: "Invalid publication ID" },
            { status: 400 },
          );
        let caption: string | undefined;
        if (action === "edit") {
          const body = JSON.parse(
            (await readBody(req, 16384, "Caption request")).toString("utf8"),
          );
          const result = z
            .object({ caption: z.string().trim().min(1).max(2200) })
            .strict()
            .safeParse(body);
          if (!result.success)
            return Response.json(
              { error: "Provide a caption between 1 and 2200 characters" },
              { status: 400 },
            );
          caption = result.data.caption;
        }
        return Response.json(
          await managePublication(projectId, id, action, caption),
        );
      } catch (error) {
        if (error instanceof SyntaxError)
          return Response.json(
            { error: "Invalid request body" },
            { status: 400 },
          );
        logger.warn("publications.request.failed", { error });
        const known = error instanceof PublicationError;
        return Response.json(
          {
            error: known
              ? error.message
              : "The operation could not be confirmed. Check the post on the network before trying again.",
          },
          { status: known ? error.status : 502 },
        );
      }
    }),
  );
}
export const POST = (req: Request, ctx: Context) => handle(req, ctx, "refresh");
export const PATCH = (req: Request, ctx: Context) => handle(req, ctx, "edit");
export const DELETE = (req: Request, ctx: Context) =>
  handle(req, ctx, "delete");
