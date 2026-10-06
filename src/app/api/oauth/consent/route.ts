import { authenticated } from "@/lib/api-auth";
import { oauthConsentContext } from "@/lib/oauth";
import { getAuth } from "@/lib/auth";
import { z } from "zod";
import { appOrigin } from "@/lib/oauth-provider";
export async function POST(req: Request) {
  return authenticated(req, async (userId) => {
    try {
      const body = z
        .object({ accept: z.boolean(), oauth_query: z.string().max(10000) })
        .parse(await req.json());
      await oauthConsentContext(body.oauth_query, userId, req.headers);
      // The HTTP handler runs the provider's signed-query continuation hooks.
      const response = await getAuth().handler(
        new Request(appOrigin() + "/api/auth/oauth2/consent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            accept: "application/json",
            cookie: req.headers.get("cookie") || "",
            origin: appOrigin(),
          },
          body: JSON.stringify(body),
        }),
      );
      const url = response.headers.get("location");
      if (url && response.status >= 300 && response.status < 400)
        return Response.json({ url });
      return response;
    } catch (e) {
      return Response.json(
        { error: e instanceof Error ? e.message : "Invalid consent request" },
        { status: 400 },
      );
    }
  });
}
