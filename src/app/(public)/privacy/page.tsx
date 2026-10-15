import Link from "next/link";
import type { Metadata } from "next";
import {
  DocumentSection,
  PageIntro,
  PolicyDate,
} from "@/components/public/site-shell";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Privacy policy | Ramblo",
  description:
    "How Ramblo handles your account, drafts, media, and connected social accounts.",
  alternates: { canonical: "/privacy" },
};
export default function PrivacyPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16"
    >
      <PageIntro
        title="Privacy policy"
        description="Information concerning the collection, use, disclosure, and retention of personal data in connection with Ramblo."
      />
      <PolicyDate date="2026-10-15" />
      <DocumentSection
        id="controller"
        title="Identity and contact details of the controller"
      >
        <p>
          {site.operator}, established in {site.country}, with its registered
          address at {site.address} and tax identification number {site.taxId},
          operates Ramblo and is the controller of personal data processed for
          account administration and the operation of the Service as described
          in this Privacy Policy.
        </p>
        <p>
          Questions concerning this Policy and requests relating to personal
          data may be addressed to{" "}
          <a className="document-link" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          . Further corporate information is available in our{" "}
          <Link className="document-link" href="/legal">
            legal notice
          </Link>
          .
        </p>
      </DocumentSection>
      <DocumentSection
        id="information"
        title="Categories and sources of personal data"
      >
        <p>
          Depending on the features used, the Service processes the following
          categories of information, provided by you, submitted by an assistant
          or automation service you authorise, obtained from connected accounts
          within the permissions granted, or generated through operation of the
          Service:
        </p>
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-foreground">
              Account and authentication data:
            </strong>{" "}
            name, email address, password hash, session and verification
            records, and available sign-in security information, including IP
            addresses and browser details.
          </li>
          <li>
            <strong className="text-foreground">
              Project and publication data:
            </strong>{" "}
            project names, draft titles and captions, uploaded or imported
            images and videos, selected channels, publication identifiers and
            links, delivery outcomes, and available publication metrics.
          </li>
          <li>
            <strong className="text-foreground">
              Connection and authorisation data:
            </strong>{" "}
            social-account identifiers and names, granted scopes, access tokens
            and expiry details, assistant authorisation grants, and token
            records.
          </li>
          <li>
            <strong className="text-foreground">
              Operational and correspondence data:
            </strong>{" "}
            technical request information, error and delivery responses, and
            support correspondence. Diagnostic records may include post content
            and social-account identifiers. The application logger applies
            credential redaction to diagnostic output.
          </li>
        </ul>
      </DocumentSection>
      <DocumentSection
        id="purposes"
        title="Purposes and legal bases of processing"
      >
        <p>
          Account creation and authentication, project administration, storage
          and display of drafts, management of authorised connections, delivery
          of User-approved publications, and responses to service requests are
          undertaken as necessary to perform our agreement with you.
        </p>
        <p>
          Security monitoring, investigation of technical failures, prevention
          of misuse, and protection of the Service are undertaken on the basis
          of our legitimate interests in maintaining a secure and reliable
          service, subject to the rights and interests of affected individuals.
          Processing necessary to satisfy a binding statutory or regulatory
          requirement is undertaken on the basis of the applicable legal
          obligation. Where an optional processing activity requires consent,
          that consent will be requested separately.
        </p>
        <p>
          The account and connection information requested for a feature is
          necessary to provide that feature. If it is not supplied, the
          corresponding functionality may be unavailable. Public informational
          pages may be accessed without creating an account.
        </p>
      </DocumentSection>
      <DocumentSection id="sharing" title="Recipients of personal data">
        <p>
          Infrastructure providers process information for the operation of the
          Service.{" "}
          <a className="document-link" href="https://vercel.com/">
            Vercel
          </a>{" "}
          (Vercel Inc.) provides application hosting, and{" "}
          <a className="document-link" href="https://neon.com/">
            Neon
          </a>{" "}
          (Neon, LLC, part of Databricks, Inc.) provides the configured database
          and private object storage.{" "}
          <a className="document-link" href="https://resend.com/">
            Resend
          </a>{" "}
          (Plus Five Five, Inc.) provides transactional email delivery and
          processes recipient details, message content, and delivery metadata
          necessary to deliver account verification, password reset, and other
          service-related messages. These providers may also process technical
          logs and maintain backups in connection with their services.
        </p>
        <p>
          When you authorise publication, the designated social network—Meta’s
          Facebook or Instagram services, or LinkedIn—receives the caption,
          media, and associated information necessary to process the request.
          Published content is subsequently subject to the destination network’s
          privacy settings, terms, and policies.
        </p>
        <p>
          An assistant or automation provider authorised through an
          account-level connection may access information exposed by the
          permitted MCP tools across your existing and future projects,
          including drafts and media references. ChatGPT, Claude, and other
          providers selected by you apply their own terms and privacy policies.
          Ramblo receives the content submitted through those connections and
          does not itself operate an AI model to generate that content.
        </p>
        <p>
          Information may also be disclosed to competent authorities or other
          recipients where disclosure is required by applicable law or a binding
          legal process.
        </p>
      </DocumentSection>
      <DocumentSection id="transfers" title="International transfers">
        <p>
          Infrastructure and connected-service providers may process information
          outside Spain or the European Economic Area. Processing locations and
          the transfer arrangements applicable to the Service depend on the
          provider and deployment configuration. Information concerning the
          destinations, applicable transfer arrangements, and safeguards
          relevant to your data may be requested at the contact address above.
        </p>
      </DocumentSection>
      <DocumentSection id="storage" title="Storage, security, and retention">
        <p>
          Uploaded and imported post media is maintained in private object
          storage. Access is made available to authenticated Users and
          authorised tools in accordance with application permissions. Temporary
          media URLs may be issued for delivery to social networks. Such URLs
          and account tokens must be protected against unauthorised disclosure.
        </p>
        <p>
          Account and project records are retained while required to provide the
          Service, until the relevant records are deleted or an account deletion
          request is processed, subject to any applicable retention obligations.
          Deleting a post removes its local draft record and initiates removal
          of its associated stored media. References to previously published
          copies may be retained separately within the project; deleting a draft
          does not automatically remove those references or the content
          published on a social network.
        </p>
        <p>
          Technical logs, support correspondence, and provider backups may
          remain after deletion of active records for periods determined by
          their operational purpose, applicable backup cycles, the need to
          investigate incidents or resolve disputes, and legal retention
          requirements. Information concerning retention applicable to a
          particular record or deletion request may be obtained through the
          contact address above.
        </p>
      </DocumentSection>
      <DocumentSection id="cookies" title="Cookies and local storage">
        <p>
          The application uses cookies necessary to authenticate Users, maintain
          sessions, and establish account connections. Browser storage is also
          used to retain the selected project and interface preferences. The
          public pages do not add advertising trackers or analytics scripts.
          Hosting providers may process technical request information for
          delivery, security, and operation of the website.
        </p>
      </DocumentSection>
      <DocumentSection id="rights" title="Rights of data subjects">
        <p>
          Subject to the conditions and limitations of applicable data
          protection law, you may request access, rectification, erasure,
          restriction of processing, or portability of personal data. You may
          object to processing based on legitimate interests on grounds relating
          to your particular situation. Where processing is based on consent,
          consent may be withdrawn at any time without affecting the lawfulness
          of processing carried out before withdrawal.
        </p>
        <p>
          Requests may be submitted to{" "}
          <a
            className="document-link"
            href={`mailto:${site.email}?subject=Ramblo%20privacy%20request`}
          >
            {site.email}
          </a>
          . We may request information reasonably necessary to verify the
          identity and authority of the requester. Requests will be addressed
          within the periods prescribed by applicable law.
        </p>
        <p>
          You may lodge a complaint with a competent supervisory authority,
          including the{" "}
          <a className="document-link" href="https://www.aepd.es/">
            Agencia Española de Protección de Datos
          </a>{" "}
          in Spain. Contacting us first is not a condition for exercising this
          right.
        </p>
      </DocumentSection>
      <DocumentSection
        id="deletion"
        title="Revocation of access and deletion requests"
      >
        <p>
          An individual project may be deleted through its Connections page.
          This removes that project’s stored records and credentials and
          schedules its media for removal, while retaining the account and any
          other projects. Account-level assistant authorisations continue to
          apply to the remaining projects until revoked separately.
        </p>
        <p>
          Social-account connections may be revoked in the project’s Connections
          screen. Assistant OAuth grants may be revoked in MCP integration, and
          account bearer tokens may be rotated to invalidate access through the
          previous token. These measures prevent subsequent access through the
          affected credentials but do not, by themselves, delete stored drafts,
          publications, or information already received by a third-party
          provider.
        </p>
        <p>
          Account deletion and associated data removal may be initiated through
          the User Account page or requested through support in accordance with
          the{" "}
          <Link className="document-link" href="/data-deletion">
            data deletion instructions
          </Link>
          . Deletion from Ramblo does not itself remove content already
          published to a third-party social network.
        </p>
        <p>
          Account access is revoked when deletion is completed. Minimal
          storage-cleanup records are retained until removal of stored media and
          a subsequent verification sweep have completed. Media deletion
          failures are retried by the recovery process.
        </p>
      </DocumentSection>
      <DocumentSection id="changes" title="Revisions to this Privacy Policy">
        <p>
          This Policy may be revised to reflect changes in the Service or the
          processing practices described herein. The current version and
          revision date will be displayed on this page. Material changes will be
          communicated through the Service or the account email address where
          appropriate or required by law. Where a new processing activity
          requires consent, publication of a revised Policy will not substitute
          for obtaining that consent.
        </p>
      </DocumentSection>
    </main>
  );
}
