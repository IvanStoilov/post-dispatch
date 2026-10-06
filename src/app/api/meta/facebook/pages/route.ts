import {
  availablePages,
  selectPage,
  connectionError,
} from "@/lib/meta-connect";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    return await availablePages(req);
  } catch (error) {
    return connectionError("facebook", error);
  }
}
export async function POST(req: Request) {
  try {
    return await selectPage(req);
  } catch (error) {
    return connectionError("facebook", error);
  }
}
