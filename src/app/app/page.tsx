import type { Metadata } from "next";
import { appPageUrl } from "@/lib/origins";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import Dashboard from "../dashboard";

export const metadata: Metadata = {
  alternates: { canonical: appPageUrl() },
  robots: { index: false, follow: false },
};

export default async function Home() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect(appPageUrl("/signin"));
  return (
    <Dashboard user={{ name: session.user.name, email: session.user.email }} />
  );
}
