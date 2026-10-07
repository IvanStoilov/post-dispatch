import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { Landing } from "@/components/public/landing";
import { getAuth } from "@/lib/auth";
import Dashboard from "./dashboard";

export default async function Home() {
  const requestHeaders = await headers();
  if (!getSessionCookie(requestHeaders)) return <Landing />;
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return <Landing />;
  return (
    <Dashboard user={{ name: session.user.name, email: session.user.email }} />
  );
}
