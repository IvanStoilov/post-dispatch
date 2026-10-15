import { after } from "next/server";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import { readBody } from "@/lib/request-body";
import { appOrigin } from "@/lib/origins";
import { logger, loggedRequest } from "@/lib/logger";
import {
  AccountDeletionError,
  deleteOwnAccount,
  limitDeletionAttempts,
  recoverAccountMediaCleanup,
} from "@/lib/account-deletion";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function DELETE(request: Request) {
  return loggedRequest(request, "/api/account", async () => {
    if (request.headers.get("origin") !== appOrigin())
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session)
      return Response.json({ error: "Sign in to continue" }, { status: 401 });
    let body: { password: string; confirmation: "DELETE" };
    try {
      body = z
        .object({
          password: z.string().min(1).max(128),
          confirmation: z.literal("DELETE"),
        })
        .strict()
        .parse(
          JSON.parse(
            (
              await readBody(request, 4096, "Account deletion request")
            ).toString("utf8"),
          ),
        );
    } catch {
      return Response.json(
        { error: "Enter your current password and type DELETE to confirm." },
        { status: 400 },
      );
    }
    try {
      await limitDeletionAttempts(session.user.id);
      try {
        await auth.api.verifyPassword({
          headers: request.headers,
          body: { password: body.password },
        });
      } catch {
        return Response.json(
          {
            error:
              "Your password could not be verified. Check it or sign in again.",
          },
          { status: 400 },
        );
      }
      await deleteOwnAccount(session.user.id);
    } catch (error) {
      logger.warn("account.deletion.rejected", {
        userId: session.user.id,
        error,
      });
      return Response.json(
        {
          error:
            error instanceof AccountDeletionError
              ? error.message
              : "Your account could not be deleted. Please try again or contact support.",
        },
        { status: error instanceof AccountDeletionError ? error.status : 503 },
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
    const cleanup = async () => {
      try {
        await recoverAccountMediaCleanup();
      } catch (error) {
        logger.error("account.media_cleanup.recovery.failed", { error });
      }
    };
    try {
      after(cleanup);
    } catch {
      await cleanup();
    }
    return response;
  });
}
