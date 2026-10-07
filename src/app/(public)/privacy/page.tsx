import Link from "next/link";
import type { Metadata } from "next";
import {
  DocumentSection,
  PageIntro,
  PolicyDate,
} from "@/components/public/site-shell";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Privacy policy | PostDispatch",
  description:
    "How PostDispatch handles your account, drafts, media, and connected social accounts.",
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
        description="How your information is used when you create, review, and publish with PostDispatch."
      />
      <PolicyDate />
      <DocumentSection id="controller" title="Who operates PostDispatch">
        <p>
          {site.operator}, based in {site.country}, operates PostDispatch and is
          responsible for personal data used to manage your account and provide
          the service. Our registered address is {site.address}. Our tax ID is{" "}
          {site.taxId}.
        </p>
        <p>
          For privacy questions or requests, email{" "}
          <a className="document-link" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          .{" "}
          <Link className="document-link" href="/legal">
            View company details
          </Link>
          .
        </p>
      </DocumentSection>
      <DocumentSection id="information" title="Information we handle">
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            <strong className="text-foreground">Account information:</strong>{" "}
            your name, email address, password hash, session records, and
            available sign-in security information such as IP address and
            browser details.
          </li>
          <li>
            <strong className="text-foreground">Project content:</strong>{" "}
            project names, draft titles and captions, uploaded or imported
            images and videos, selected channels, and delivery results.
          </li>
          <li>
            <strong className="text-foreground">Connection information:</strong>{" "}
            social account IDs and names, authorization scopes, access tokens,
            and expiry information. Assistant connections also include
            authorization grants and token records.
          </li>
          <li>
            <strong className="text-foreground">
              Operational information:
            </strong>{" "}
            request details, errors, publishing responses, and support
            correspondence. Diagnostic logs can contain post content and social
            account identifiers; authentication credentials are redacted by the
            application logger.
          </li>
        </ul>
      </DocumentSection>
      <DocumentSection id="purposes" title="Why we use it">
        <p>
          We use this information to create and authenticate your account, keep
          projects separate, store and display drafts, connect accounts you
          authorize, publish posts you submit, troubleshoot errors, and answer
          support requests.
        </p>
        <p>
          Providing the service and answering service requests is based on
          performing our agreement with you. Protecting accounts, investigating
          failures, and preventing misuse is based on our legitimate interests
          in operating a reliable, secure service. We process information to
          meet legal obligations where those apply. If we introduce an optional
          activity that requires consent, we will request that consent
          separately.
        </p>
        <p>
          Account and connection information is necessary to use the
          corresponding features. You can browse these public pages without
          creating an account.
        </p>
      </DocumentSection>
      <DocumentSection id="sharing" title="Who receives your information">
        <p>
          Our infrastructure providers process information to operate
          PostDispatch: Vercel hosts the application, and Neon provides the
          configured database and private object storage. Their services can
          also process technical logs and maintain backups under their own
          contractual terms.
        </p>
        <p>
          When you publish, the selected network—Meta for Facebook and
          Instagram, or LinkedIn—receives the caption and media needed to create
          the post. The resulting published content is subject to the network’s
          privacy settings and policies.
        </p>
        <p>
          An assistant or automation provider you connect can access the project
          information exposed by the tools you authorize, including drafts and
          their media references. ChatGPT, Claude, and any automation or AI
          provider you choose have their own terms and privacy practices.
          PostDispatch receives submitted drafts; it does not run an AI model to
          generate them itself.
        </p>
        <p>
          Providers may process information outside Spain or the European
          Economic Area. The applicable locations and transfer arrangements
          depend on the provider and deployment configuration. Contact us for
          information about the arrangements applying to your data. We may also
          disclose information when legally required.
        </p>
      </DocumentSection>
      <DocumentSection id="storage" title="Storage and retention">
        <p>
          Draft media is stored privately. Authenticated users and authorized
          tools can receive access to it; temporary media URLs are also provided
          when necessary for delivery to social networks. Keep those URLs and
          your project tokens private.
        </p>
        <p>
          Account and project records are kept while you use the service, until
          you delete the relevant content or request account deletion. Deleting
          a post removes its PostDispatch record and associated stored media. If
          media removal fails, contact support so we can investigate. This does
          not delete posts already published on social networks.
        </p>
        <p>
          Logs, support records, and provider backups may remain after active
          records are removed, according to their retention cycles or where
          needed to investigate an incident, meet legal obligations, or resolve
          a dispute. Contact us for details of the retention applicable to a
          specific request.
        </p>
      </DocumentSection>
      <DocumentSection id="cookies" title="Cookies and browser storage">
        <p>
          The application uses cookies necessary for sign-in, sessions, and
          connecting accounts. It also uses browser storage to remember your
          selected project and interface preferences. Our public pages do not
          add advertising trackers or analytics scripts. Hosting services may
          process technical request information to serve and protect the
          application.
        </p>
      </DocumentSection>
      <DocumentSection id="rights" title="Your rights">
        <p>
          Where applicable, you can request access to, correction of, deletion
          of, or portability of your personal data, and ask to restrict or
          object to processing. You can withdraw consent for processing based on
          consent, without affecting earlier lawful processing. We may need to
          verify your identity before acting on a request.
        </p>
        <p>
          Send requests to{" "}
          <a
            className="document-link"
            href={`mailto:${site.email}?subject=PostDispatch%20privacy%20request`}
          >
            {site.email}
          </a>
          . You may also complain to your local supervisory authority; in Spain
          this is the{" "}
          <a className="document-link" href="https://www.aepd.es/">
            Agencia Española de Protección de Datos
          </a>
          .
        </p>
      </DocumentSection>
      <DocumentSection id="deletion" title="Disconnecting and deleting data">
        <p>
          Disconnect social accounts in your project’s Connections screen.
          Revoke assistant OAuth grants in MCP integration; rotate the project
          bearer token to invalidate clients using that token. These actions
          stop future access through those credentials but do not remove saved
          posts.
        </p>
        <p>
          For account deletion and related data removal, follow the{" "}
          <Link className="document-link" href="/data-deletion">
            data deletion instructions
          </Link>
          . Account deletion is currently handled through support.
        </p>
      </DocumentSection>
      <DocumentSection id="changes" title="Changes to this policy">
        <p>
          We update this page when the service or our practices change and
          revise the date above. Material changes will be communicated through
          the service or your account email where appropriate.
        </p>
      </DocumentSection>
    </main>
  );
}
