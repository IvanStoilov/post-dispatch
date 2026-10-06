import { oauthChallenge } from "@/lib/oauth";
import { handleProjectMcp } from "@/lib/mcp";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  return handleProjectMcp(req, (await ctx.params).projectId);
}
export async function GET(
  req: Request,
  ctx: { params: Promise<{ projectId: string }> },
) {
  if (!req.headers.get("authorization")) {
    try {
      return await oauthChallenge((await ctx.params).projectId);
    } catch {
      return new Response(null, { status: 404 });
    }
  }
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
