import { authenticated, ownedProject } from "@/lib/api-auth";
import { createDirectUpload, completeDirectUpload } from "@/lib/direct-uploads";
import { readBody } from "@/lib/request-body";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 300;
const completion = z.object({ uploadId: z.uuid() }).strict();
export async function POST(req: Request) {
  return authenticated(req, async (userId) => {
    const projectId = await ownedProject(req, userId);
    try {
      return Response.json(
        await createDirectUpload(
          projectId,
          JSON.parse((await readBody(req, 4096, "Upload request")).toString()),
        ),
        { status: 201 },
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Invalid upload" },
        { status: 400 },
      );
    }
  });
}
export async function PATCH(req: Request) {
  return authenticated(req, async (userId) => {
    const projectId = await ownedProject(req, userId);
    try {
      const input = completion.parse(
        JSON.parse((await readBody(req, 4096, "Upload request")).toString()),
      );
      return Response.json(
        await completeDirectUpload(projectId, input.uploadId),
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Could not finalize upload",
        },
        { status: 400 },
      );
    }
  });
}
