import { authenticated } from "@/lib/api-auth";
import { disconnectOAuth } from "@/lib/oauth";
import { z } from "zod";
export async function DELETE(req: Request) {
  return authenticated(req, async (userId) => {
    const clientId = z
      .string()
      .min(1)
      .max(2048)
      .safeParse(new URL(req.url).searchParams.get("clientId"));
    if (!clientId.success)
      return Response.json({ error: "Invalid client" }, { status: 400 });
    await disconnectOAuth(userId, clientId.data);
    return Response.json({ ok: true });
  });
}
