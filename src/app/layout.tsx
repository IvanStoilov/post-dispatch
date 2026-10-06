import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "PostDispatch — Your publishing desk",
  description: "AI drafts. You approve. PostDispatch publishes.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
