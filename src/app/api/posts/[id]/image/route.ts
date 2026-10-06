import { authenticated, ownedProject } from "@/lib/api-auth";
import { getPostImage } from "@/lib/store";
import { readImage } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return authenticated(req, async (userId) => {
    const projectId = await ownedProject(req, userId);
    let post;
    try {
      post = await getPostImage(projectId, (await ctx.params).id);
    } catch {
      return new Response(null, { status: 404 });
    }
    if (!post.imageKey || !post.imageBucket)
      return new Response(null, { status: 404 });
    try {
      const bytes = await readImage({
        imageKey: post.imageKey,
        imageBucket: post.imageBucket,
      });
      return new Response(Buffer.from(bytes), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return Response.json({ error: "Image unavailable" }, { status: 502 });
    }
  });
}
