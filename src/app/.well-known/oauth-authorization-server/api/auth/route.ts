import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { getAuth } from "@/lib/auth";
export async function GET(req: Request) {
  return oauthProviderAuthServerMetadata(getAuth())(req);
}
