import { z } from "zod";
import { authenticated } from "@/lib/api-auth";
import { getOwnTermsAcceptance } from "@/lib/terms-acceptance";
import { loggedRequest } from "@/lib/logger";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return loggedRequest(request, "/api/account/agreements/[id]", () =>
    authenticated(request, async (userId) => {
      const { id } = await ctx.params;
      if (!z.uuid().safeParse(id).success)
        return Response.json({ error: "Agreement not found" }, { status: 404 });
      const record = await getOwnTermsAcceptance(userId, id);
      return record
        ? Response.json(record, {
            headers: { "Cache-Control": "private, no-store" },
          })
        : Response.json({ error: "Agreement not found" }, { status: 404 });
    }),
  );
}
