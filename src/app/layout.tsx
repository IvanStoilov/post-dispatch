import { brand } from "@/lib/brand";
import type { Metadata, Viewport } from "next";
import { siteOrigin } from "@/lib/public-site";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const title = `${process.env.NODE_ENV === "development" ? "[Dev] " : ""}${brand.name} — ${brand.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description:
      "Receive AI drafts, review your content, and publish to Facebook, Instagram, and LinkedIn.",
    type: "website",
    siteName: brand.name,
    locale: "en_GB",
    images: [
      {
        url: "/brand/social-card.png",
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: brand.description,
    images: ["/brand/social-card.png"],
  },
  description: brand.description,
};
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f2" },
    { media: "(prefers-color-scheme: dark)", color: "#17221c" },
  ],
};
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
