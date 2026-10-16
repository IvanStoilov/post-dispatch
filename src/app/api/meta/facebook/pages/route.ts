import { loggedRequest } from "@/lib/logger";
import {
  handleConnection,
  listAccounts,
  selectAccount,
} from "@/server/connections";
export const runtime = "nodejs";
export async function GET(req: Request) {
  return loggedRequest(req, "/api/meta/facebook/pages", () =>
    handleConnection("facebook", (provider) => listAccounts(req, provider)),
  );
}
export async function POST(req: Request) {
  return loggedRequest(req, "/api/meta/facebook/pages", () =>
    handleConnection("facebook", (provider) => selectAccount(req, provider)),
  );
}
