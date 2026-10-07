import { completeDirectUpload } from "@/lib/direct-uploads";
import { readBody } from "@/lib/request-body";
import { z } from "zod";
export const runtime = "nodejs";
export const maxDuration = 300;
const schema = z
  .object({ uploadId: z.uuid(), completionToken: z.string().min(1).max(100) })
  .strict();
export async function POST(req: Request) {
  try {
    const input = schema.parse(
      JSON.parse((await readBody(req, 4096, "Upload request")).toString()),
    );
    return Response.json(
      await completeDirectUpload(
        new URL(req.url).searchParams.get("projectId") || "",
        input.uploadId,
        input.completionToken,
      ),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not finalize upload",
      },
      { status: 400 },
    );
  }
}
