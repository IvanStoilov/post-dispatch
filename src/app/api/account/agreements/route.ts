import { z } from "zod";
import { getDb } from "@/db";
import { termsAcceptances } from "@/db/schema";
import { authenticated } from "@/lib/api-auth";
import { appOrigin } from "@/lib/origins";
import { readBody } from "@/lib/request-body";
import { validateTermsAcceptance } from "@/lib/terms-acceptance";
import { loggedRequest, logger } from "@/lib/logger";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return loggedRequest(request, "/api/account/agreements", () =>
    authenticated(request, async (userId) => {
      if (request.headers.get("origin") !== appOrigin())
        return Response.json({ error: "Invalid origin" }, { status: 403 });
      try {
        const body = z
          .object({
            termsAccepted: z.literal(true),
            termsVersion: z.string(),
            termsHash: z.string(),
          })
          .strict()
          .parse(
            JSON.parse(
              (await readBody(request, 4096, "Terms acceptance")).toString(
                "utf8",
              ),
            ),
          );
        const terms = validateTermsAcceptance(body);
        await getDb()
          .insert(termsAcceptances)
          .values({
            userId,
            termsVersion: terms.version,
            termsContent: terms.content,
            termsHash: terms.hash,
            acceptanceSource: "account",
          })
          .onConflictDoNothing();
        return Response.json({ accepted: true });
      } catch (error) {
        logger.warn("terms.acceptance.rejected", { userId, error });
        return Response.json(
          {
            error:
              "Review and accept the current Terms of Service. Reload if they have changed.",
          },
          { status: 400 },
        );
      }
    }),
  );
}
