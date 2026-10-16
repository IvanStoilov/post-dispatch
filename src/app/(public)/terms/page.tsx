import type { Metadata } from "next";
import { termsService } from "@/domain/terms";
import { TermsDocument } from "@/components/terms-document";
export const metadata: Metadata = {
  title: "Terms of service | Ramblo",
  description:
    "Terms governing draft creation, user approval and publication through Ramblo.",
  alternates: { canonical: "/terms" },
};
export const dynamic = "force-dynamic";
export default function TermsPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-12 sm:px-8 sm:py-16"
    >
      <TermsDocument content={termsService.current().content} />
    </main>
  );
}
