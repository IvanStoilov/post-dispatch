import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppNavigationProvider } from "@/components/app-navigation";
import { isCleanAppHost } from "@/lib/origins";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = (await headers()).get("host");
  return (
    <AppNavigationProvider cleanHost={isCleanAppHost(host)}>
      {children}
    </AppNavigationProvider>
  );
}
