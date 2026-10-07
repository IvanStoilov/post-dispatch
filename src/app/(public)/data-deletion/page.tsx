import type { Metadata } from "next";
import { PageIntro, DocumentSection } from "@/components/public/site-shell";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Data deletion | PostDispatch",
  description:
    "Request removal of your PostDispatch account and connected account data.",
  alternates: { canonical: "/data-deletion" },
};
export default function DeletionPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16"
    >
      <PageIntro
        title="Delete your PostDispatch data"
        description="Account deletion is currently handled by our support team. You can remove individual posts and disconnect accounts in the dashboard."
      />
      <DocumentSection id="request" title="Request account deletion">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          <li>
            Email {site.email} from your PostDispatch account email, with the
            subject “PostDispatch account deletion”.
          </li>
          <li>
            Tell us whether you want your whole account removed or only a
            particular project’s connection data. Do not include passwords or
            tokens.
          </li>
          <li>
            We will confirm the scope and verify your identity where necessary
            before removing the relevant active records and stored media,
            subject to applicable legal retention requirements.
          </li>
        </ol>
        <Button className="w-fit" asChild>
          <a
            href={`mailto:${site.email}?subject=PostDispatch%20account%20deletion`}
          >
            <Mail data-icon="inline-start" aria-hidden="true" />
            Request deletion
          </a>
        </Button>
      </DocumentSection>
      <DocumentSection id="disconnect" title="Stop future access">
        <p>
          Disconnect Facebook, Instagram, or LinkedIn in the project’s
          Connections screen. Revoke assistant grants in MCP integration, and
          rotate the bearer token if you shared it with an automation tool. You
          can also remove PostDispatch’s authorization in the social network’s
          own settings.
        </p>
        <p>
          Disable any external daily automation separately. Removing an account
          connection does not delete saved drafts.
        </p>
      </DocumentSection>
      <DocumentSection id="published" title="Posts already published">
        <p>
          Deleting data from PostDispatch does not remove posts on Facebook,
          Instagram, or LinkedIn. Delete those posts directly on the relevant
          network. Provider backups and logs may remain according to their
          retention cycles or applicable legal requirements.
        </p>
      </DocumentSection>
    </main>
  );
}
