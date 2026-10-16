import type { Metadata } from "next";
import { Mail } from "lucide-react";
import Link from "next/link";
import { PageIntro, DocumentSection } from "@/components/public/site-shell";
import { Button } from "@/components/ui/button";
import { site } from "@/lib/public-site";
import { appPageUrl } from "@/lib/origins";

export const metadata: Metadata = {
  title: "Data deletion | Ramblo",
  description:
    "Request removal of your Ramblo account and connected account data.",
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
        title="Delete your Ramblo data"
        description="Delete your account from the User Account page, or contact support for assistance."
      />
      <DocumentSection
        id="self-service"
        title="Delete your account in the application"
      >
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          <li>
            Sign in and select your name or email in the sidebar to open User
            Account.
          </li>
          <li>
            Select Delete account, enter your current password, and type DELETE
            to confirm.
          </li>
          <li>
            Confirm permanent deletion. Your account, projects, drafts,
            connection credentials, and assistant access are removed. Queued
            publications are cancelled, and stored media is scheduled for
            removal with automatic retries.
          </li>
        </ol>
        <p>
          If a publication is actively being processed, wait for it to finish
          before retrying. If it remains stuck, contact support. Published posts
          on social networks are not removed by account deletion. Minimal
          cleanup records remain until media removal and a subsequent
          verification sweep are complete.
        </p>
        <Button className="w-fit" asChild>
          <Link href={appPageUrl("/account")}>Open User Account</Link>
        </Button>
      </DocumentSection>
      <DocumentSection id="project" title="Delete an individual project">
        <p>
          Open the project’s Connections page and select Delete project. Enter
          the project’s name exactly and confirm permanent deletion. This
          removes its drafts, connection credentials, publication records, and
          upload permissions, cancels queued publications, and schedules stored
          media for removal. Your account and other projects remain available.
        </p>
        <p>
          If a publication is actively being processed, wait for it to finish
          before retrying. Posts already published on social networks remain
          there. Disable any external automation targeting the deleted project
          separately.
        </p>
      </DocumentSection>
      <DocumentSection id="request" title="Request account deletion">
        <ol className="flex list-decimal flex-col gap-3 pl-5">
          <li>
            Email {site.email} from your Ramblo account email, with the subject
            “Ramblo account deletion”.
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
          <a href={`mailto:${site.email}?subject=Ramblo%20account%20deletion`}>
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
          can also remove Ramblo’s authorization in the social network’s own
          settings.
        </p>
        <p>
          Disable any external daily automation separately. Removing an account
          connection does not delete saved drafts.
        </p>
      </DocumentSection>
      <DocumentSection id="published" title="Posts already published">
        <p>
          Deleting data from Ramblo does not remove posts on Facebook,
          Instagram, or LinkedIn. Delete those posts directly on the relevant
          network. Provider backups and logs may remain according to their
          retention cycles or applicable legal requirements.
        </p>
      </DocumentSection>
    </main>
  );
}
