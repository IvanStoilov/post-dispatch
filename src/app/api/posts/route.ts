import { createPost, listPosts } from "@/lib/store";
export const runtime = "nodejs";
export async function GET() {
  return Response.json(await listPosts());
}
export async function POST(req: Request) {
  try {
    return Response.json(await createPost(await req.json()), { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid draft" },
      { status: 400 },
    );
  }
}
