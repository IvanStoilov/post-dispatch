import { protectedResourceMetadata } from "@/lib/oauth";
export async function GET() {
  return protectedResourceMetadata();
}
