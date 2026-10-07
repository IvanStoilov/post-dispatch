import {
  availableLinkedInAccounts,
  selectLinkedInAccount,
  connectionError,
} from "@/lib/connector-connect";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return await availableLinkedInAccounts(req);
  } catch (error) {
    return connectionError("linkedin", error);
  }
}
export async function POST(req: Request) {
  try {
    return await selectLinkedInAccount(req);
  } catch (error) {
    return connectionError("linkedin", error);
  }
}
