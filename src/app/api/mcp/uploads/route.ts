import { z } from "zod";
import { UserFacingError } from "@/domain/shared/errors";
import { uploadsService } from "@/domain/uploads";
import { loggedRequest, logger } from "@/lib/logger";
import { readBody } from "@/lib/request-body";
import { IMAGE_TOO_LARGE, MAX_IMAGE_BYTES } from "@/shared/media";
export const runtime = "nodejs";

// Agents POST image bytes (raw, or multipart field "file") here with an
// upload token from the create_upload_token MCP tool.

class BodyError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function imageBytes(req: Request) {
  let body: Buffer;
  try {
    body = await readBody(req, MAX_IMAGE_BYTES + 64 * 1024, "Image");
  } catch (error) {
    if (error instanceof Error && /too large/.test(error.message))
      throw new BodyError(IMAGE_TOO_LARGE, 413);
    throw new BodyError("Could not read the image", 400);
  }
  const type = req.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data")) return body;
  const form = await new Response(new Uint8Array(body), {
    headers: { "Content-Type": type },
  })
    .formData()
    .catch(() => undefined);
  const file = form?.get("file");
  if (!(file instanceof Blob))
    throw new BodyError(
      'Send the image in a multipart field named "file"',
      400,
    );
  return Buffer.from(await file.arrayBuffer());
}

export async function POST(req: Request) {
  return loggedRequest(req, "/api/mcp/uploads", async () => {
    const projectId = new URL(req.url).searchParams.get("projectId") || "";
    try {
      if (!z.uuid().safeParse(projectId).success)
        throw new BodyError("A valid projectId is required for uploads", 400);
      const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i);
      return Response.json(
        await uploadsService.receiveWithToken(
          { projectId, token: token?.[1] },
          () => imageBytes(req),
        ),
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof BodyError || error instanceof UserFacingError) {
        logger.warn("http.handler.rejected", { error });
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
      logger.error("upload.failure", { error });
      return Response.json({ error: "Image upload failed" }, { status: 500 });
    }
  });
}
