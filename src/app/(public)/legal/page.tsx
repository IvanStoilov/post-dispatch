import type { Metadata } from "next";
import { PageIntro } from "@/components/public/site-shell";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Company details | PostDispatch",
  description:
    "Legal and contact information for Growth Optimize SL, the operator of PostDispatch.",
  alternates: { canonical: "/legal" },
};
export default function LegalPage() {
  const details = [
    ["Operator", site.operator],
    ["Registered address", site.address],
    ["Tax ID (NIF)", site.taxId],
    ["Country", site.country],
    ...(site.registry ? [["Commercial Registry", site.registry]] : []),
  ];
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16"
    >
      <PageIntro
        title="Company details"
        description="PostDispatch is operated by Growth Optimize SL."
      />
      <dl className="flex flex-col divide-y">
        {details.map(([label, value]) => (
          <div key={label} className="grid gap-2 py-5 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium">{label}</dt>
            <dd className="leading-7 text-muted-foreground">{value}</dd>
          </div>
        ))}
        <div className="grid gap-2 py-5 sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium">Contact</dt>
          <dd>
            <a className="document-link" href={`mailto:${site.email}`}>
              {site.email}
            </a>
          </dd>
        </div>
      </dl>
    </main>
  );
}
