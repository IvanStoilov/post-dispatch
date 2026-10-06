import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import Dashboard from "./dashboard";
export default async function Home() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/signin");
  return (
    <Dashboard user={{ name: session.user.name, email: session.user.email }} />
  );
}
