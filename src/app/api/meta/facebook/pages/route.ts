import { loggedRequest, logger } from "@/lib/logger";
import {
  availablePages,
  selectPage,
  connectionError,
} from "@/lib/meta-connect";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return loggedRequest(req, "/api/meta/facebook/pages", async () => {
    try {
      return await availablePages(req);
    } catch (error) {
      logger.warn("http.handler.rejected", { error: error });

      return connectionError("facebook", error);
    }
  });
}
export async function POST(req: Request) {
  return loggedRequest(req, "/api/meta/facebook/pages", async () => {
    try {
      return await selectPage(req);
    } catch (error) {
      logger.warn("http.handler.rejected", { error: error });

      return connectionError("facebook", error);
    }
  });
}
