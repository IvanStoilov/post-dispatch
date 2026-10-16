import { postsService } from "@/domain/posts";
import { UserFacingError } from "@/domain/shared/errors";
import { authenticated } from "@/lib/api-auth";
import { loggedRequest } from "@/lib/logger";
import { postRef } from "@/shared/schemas/post";
export const runtime = "nodejs";

// The post's preview image for its owner, linked from PostDto.imageUrl.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return loggedRequest(req, "/api/posts/[id]/image", () =>
    authenticated(req, async (userId) => {
      const ref = postRef.safeParse({
        ...(await ctx.params),
        projectId: new URL(req.url).searchParams.get("projectId"),
      });
      if (!ref.success) return new Response(null, { status: 404 });
      try {
        const bytes = await postsService.previewImage({ userId }, ref.data);
        return new Response(bytes, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (error) {
        if (!(error instanceof UserFacingError)) throw error;
        return Response.json(
          { error: error.message },
          { status: error.status },
        );
      }
    }),
  );
}
