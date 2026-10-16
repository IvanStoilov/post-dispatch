import { z } from "zod";
import { accountService } from "@/domain/account";
import { UserFacingError } from "@/domain/shared/errors";
import { getAuth } from "@/lib/auth";
import { logger, loggedRequest } from "@/lib/logger";
import { appOrigin } from "@/lib/origins";
import { readBody } from "@/lib/request-body";
export const runtime = "nodejs";
export const maxDuration = 300;

// Account deletion. A plain route rather than /api/v1: it re-checks the
// password with the auth library and clears the session cookies.
const deletion = z
  .object({
    password: z.string().min(1).max(128),
    confirmation: z.literal("DELETE"),
  })
  .strict();

export async function DELETE(request: Request) {
  return loggedRequest(request, "/api/account", async () => {
    if (request.headers.get("origin") !== appOrigin())
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    let body: z.output<typeof deletion>;
    try {
      body = deletion.parse(
        JSON.parse(
          (await readBody(request, 4096, "Account deletion request")).toString(
            "utf8",
          ),
        ),
      );
    } catch {
      return Response.json(
        { error: "Enter your current password and type DELETE to confirm." },
        { status: 400 },
      );
    }
    try {
      await accountService.deleteAccount(
        { userId: session.user.id },
        {
          verifyPassword: () =>
            auth.api
              .verifyPassword({
                headers: request.headers,
                body: { password: body.password },
              })
              .then(
                () => true,
                () => false,
              ),
        },
      );
    } catch (error) {
      logger.warn("account.deletion.rejected", { error });
      const known = error instanceof UserFacingError;
      return Response.json(
        {
          error: known
            ? error.message
            : "Your account could not be deleted. Please try again or contact support.",
        },
        { status: known ? error.status : 503 },
      );
    }
    const response = Response.json({ deleted: true });
    try {
      const signedOut = await auth.api.signOut({
        headers: request.headers,
        asResponse: true,
      });
      for (const cookie of signedOut.headers.getSetCookie())
        response.headers.append("set-cookie", cookie);
    } catch (error) {
      logger.warn("account.deletion.cookie_cleanup.failed", { error });
    }
    return response;
  });
}
