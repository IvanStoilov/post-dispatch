import { loggedRequest } from "@/lib/logger";
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return loggedRequest(req, "/api/auth/[...all]", async () => {
    return toNextJsHandler(getAuth()).GET(req);
  });
}
export async function POST(req: Request) {
  return loggedRequest(req, "/api/auth/[...all]", async () => {
    return toNextJsHandler(getAuth()).POST(req);
  });
}
