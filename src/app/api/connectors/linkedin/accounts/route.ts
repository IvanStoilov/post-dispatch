import { loggedRequest, logger } from "@/lib/logger";
import {
  availableLinkedInAccounts,
  selectLinkedInAccount,
  connectionError,
} from "@/lib/connector-connect";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return loggedRequest(req, "/api/connectors/linkedin/accounts", async () => {
    try {
      return await availableLinkedInAccounts(req);
    } catch (error) {
      logger.warn("http.handler.rejected", { error: error });

      return connectionError("linkedin", error);
    }
  });
}
export async function POST(req: Request) {
  return loggedRequest(req, "/api/connectors/linkedin/accounts", async () => {
    try {
      return await selectLinkedInAccount(req);
    } catch (error) {
      logger.warn("http.handler.rejected", { error: error });

      return connectionError("linkedin", error);
    }
  });
}
