import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import AuthForm from "../auth-form";
export default async function Page() {
  if (await getAuth().api.getSession({ headers: await headers() }))
    redirect("/");
  return <AuthForm mode="signin" />;
}
