import { handleProjectMcp } from "@/lib/mcp";
export const runtime = "nodejs";
export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleProjectMcp(req, (await ctx.params).projectId);
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
