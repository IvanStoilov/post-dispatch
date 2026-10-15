import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { directUploads } from "@/db/schema";
import { z } from "zod";
import { storageProvider } from "@/lib/storage/index";
import { readBody } from "@/lib/request-body";
import { loggedRequest, logger } from "@/lib/logger";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function PUT(request: Request) {
  return loggedRequest(request, "/api/mcp/uploads/local", async () => {
    try {
      storageProvider("local");
    } catch {
      return new Response(null, { status: 404 });
    }
    const uploadId = new URL(request.url).searchParams.get("uploadId");
    if (!z.uuid().safeParse(uploadId).success)
      return Response.json({ error: "Invalid upload ID" }, { status: 400 });
    try {
      return await getDb().transaction(async (tx) => {
        const [upload] = await tx
          .select()
          .from(directUploads)
          .where(
            and(
              eq(directUploads.id, uploadId!),
              eq(directUploads.storageProvider, "local"),
              eq(directUploads.completed, false),
              gt(directUploads.expiresAt, new Date().toISOString()),
            ),
          )
          .for("update");
        if (!upload)
          return Response.json(
            { error: "Upload unavailable" },
            { status: 404 },
          );
        if (
          request.headers.get("content-type")?.split(";")[0] !== upload.mimeType
        )
          return Response.json(
            { error: "Upload content type does not match" },
            { status: 400 },
          );
        let bytes;
        try {
          bytes = await readBody(request, upload.fileSize, "File upload");
        } catch {
          return Response.json(
            { error: "Upload exceeds its declared size" },
            { status: 413 },
          );
        }
        if (bytes.length !== upload.fileSize)
          return Response.json(
            { error: "Upload size does not match" },
            { status: 400 },
          );
        await storageProvider(upload.storageProvider).write(
          { bucket: upload.imageBucket, key: upload.imageKey },
          bytes,
          upload.mimeType,
        );
        return new Response(null, { status: 204 });
      });
    } catch (error) {
      logger.error("storage.local.upload.failed", { error });
      return Response.json(
        { error: "Could not store uploaded file" },
        { status: 503 },
      );
    }
  });
}
