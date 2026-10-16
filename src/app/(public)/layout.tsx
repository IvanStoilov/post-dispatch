import { SiteShell } from "@/components/public/site-shell";
import { getSession } from "@/app/workspace";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  return <SiteShell isAuth={!!session}>{children}</SiteShell>;
}
