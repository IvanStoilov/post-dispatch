import type { Metadata, Viewport } from "next";
import { siteOrigin } from "@/lib/public-site";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: "PostDispatch — AI drafts, human approval",
  alternates: { canonical: "/" },
  openGraph: {
    title: "PostDispatch — AI drafts, human approval",
    description:
      "Receive AI drafts, review your content, and publish to Facebook, Instagram, and LinkedIn.",
    type: "website",
    siteName: "PostDispatch",
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "PostDispatch — AI drafts, human approval",
    description: "Your AI drafts. Your final say.",
  },
  description: "AI drafts. You approve. PostDispatch publishes.",
};
export const viewport: Viewport = { themeColor: "#f5f7fa" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
