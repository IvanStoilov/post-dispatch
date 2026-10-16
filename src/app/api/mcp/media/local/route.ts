import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { postAssets } from "@/db/schema";
import { storageProvider } from "@/lib/storage/index";
import { MAX_VIDEO_BYTES } from "@/lib/storage";
import { loggedRequest, logger } from "@/lib/logger";

export const runtime = "nodejs";
async function serve(request: Request) {
  return loggedRequest(request, "/api/mcp/media/local", async () => {
    try {
      storageProvider("local");
    } catch {
      return new Response(null, { status: 404 });
    }
    const params = new URL(request.url).searchParams;
    const [asset] = await getDb()
      .select()
      .from(postAssets)
      .where(
        and(
          eq(postAssets.storageProvider, "local"),
          eq(postAssets.imageBucket, params.get("bucket") || ""),
          eq(postAssets.imageKey, params.get("key") || ""),
        ),
      )
      .limit(1);
    if (!asset) {
      return new Response(null, { status: 404 });
    }
    try {
      const bytes = await storageProvider(asset.storageProvider).read(
        { bucket: asset.imageBucket, key: asset.imageKey },
        MAX_VIDEO_BYTES,
      );
      const headers: Record<string, string> = {
        "Content-Type": asset.mimeType,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Accept-Ranges": "bytes",
      };
      const range = request.headers.get("range");
      if (range) {
        const parts = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!parts || (!parts[1] && !parts[2])) {
          return new Response(null, {
            status: 416,
            headers: {
              ...headers,
              "Content-Length": "0",
              "Content-Range": `bytes */${bytes.length}`,
            },
          });
        }
        const start = parts[1]
          ? Number(parts[1])
          : Math.max(0, bytes.length - Number(parts[2]));
        const end =
          parts[1] && parts[2]
            ? Math.min(Number(parts[2]), bytes.length - 1)
            : bytes.length - 1;
        if (
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start >= bytes.length ||
          end < start
        ) {
          return new Response(null, {
            status: 416,
            headers: {
              ...headers,
              "Content-Length": "0",
              "Content-Range": `bytes */${bytes.length}`,
            },
          });
        }
        headers["Content-Range"] = `bytes ${start}-${end}/${bytes.length}`;
        headers["Content-Length"] = String(end - start + 1);
        return new Response(
          request.method === "HEAD"
            ? null
            : Buffer.from(bytes.subarray(start, end + 1)),
          { status: 206, headers },
        );
      }
      return new Response(
        request.method === "HEAD" ? null : Buffer.from(bytes),
        { headers },
      );
    } catch (error) {
      logger.warn("storage.local.read.failed", { assetId: asset.id, error });
      return new Response(null, { status: 404 });
    }
  });
}
export const GET = serve;
export const HEAD = serve;
