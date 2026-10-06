import { authenticated, ownedProject } from "@/lib/api-auth";
import { listOAuthConnections, disconnectOAuth } from "@/lib/oauth";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, ctx: Context) {
  return authenticated(req, async (userId) => {
    const id = await ownedProject(req, userId, (await ctx.params).id);
    return Response.json(await listOAuthConnections(userId, id), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
export async function DELETE(req: Request, ctx: Context) {
  return authenticated(req, async (userId) => {
    const id = await ownedProject(req, userId, (await ctx.params).id);
    const clientId = z
      .string()
      .min(1)
      .max(2048)
      .safeParse(new URL(req.url).searchParams.get("clientId"));
    if (!clientId.success)
      return Response.json({ error: "Invalid client" }, { status: 400 });
    await disconnectOAuth(userId, id, clientId.data);
    return Response.json({ ok: true });
  });
}
