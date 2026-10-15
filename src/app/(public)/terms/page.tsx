import Link from "next/link";
import type { Metadata } from "next";
import {
  DocumentSection,
  PageIntro,
  PolicyDate,
} from "@/components/public/site-shell";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Terms of service | Ramblo",
  description:
    "The terms for using Ramblo to receive drafts and publish approved social posts.",
  alternates: { canonical: "/terms" },
};
export default function TermsPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-5 py-12 sm:px-8 sm:py-16"
    >
      <PageIntro
        title="Terms of service"
        description="Terms governing access to and use of the Ramblo service, provided by Growth Optimize SL."
      />
      <PolicyDate date="2026-10-15" />
      <DocumentSection id="agreement" title="Agreement and service provider">
        <p>
          These Terms of Service (the “Terms”) govern access to and use of
          Ramblo, including its web application and associated interfaces (the
          “Service”), provided by {site.operator}, tax identification number{" "}
          {site.taxId}, with its registered address at {site.address} (the
          “Company”, “we”, “us”, or “our”). The person or entity accessing or
          using the Service is referred to as “you” or the “User”.
        </p>
        <p>
          By creating an account or using the Service, you accept these Terms.
          You must have the legal capacity to enter into this agreement. Where
          you act on behalf of a legal entity or connect an account belonging to
          another person, you represent that you have the authority necessary to
          do so.
        </p>
        <p>
          Communications concerning these Terms may be addressed to{" "}
          <a className="document-link" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          . Information concerning the processing of personal data is set out in
          our{" "}
          <Link className="document-link" href="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </DocumentSection>
      <DocumentSection id="service" title="Scope of the Service">
        <p>
          The Service enables Users to organise projects, store and review draft
          content and media, authorise connections to supported social networks,
          and initiate publication. Authorised assistants and automation
          services may submit and retrieve content through the Model Context
          Protocol (MCP), within the permissions granted by the User.
        </p>
        <p>
          Publication is initiated by the User through the application.
          Connecting an assistant does not, by itself, configure recurring
          content generation. Any recurring generation or submission of drafts
          requires a separately configured workflow with the relevant assistant
          or automation provider.
        </p>
        <p>
          Available functionality, supported networks, and usage limits may be
          modified as the Service develops. Material changes affecting existing
          use will be communicated as appropriate and as required by applicable
          law. Where a paid service is offered, its price, applicable taxes,
          billing frequency, renewal conditions, and cancellation terms will be
          disclosed before purchase. Acceptance of these Terms does not itself
          authorise payment for an undisclosed service.
        </p>
      </DocumentSection>
      <DocumentSection id="account" title="Account security and authorisations">
        <p>
          You shall provide accurate account information and maintain the
          confidentiality of your password, session credentials, access tokens,
          and other authentication information. You are responsible for
          instructions and access that you authorise. Any suspected compromise
          or unauthorised use of an account must be reported to the Company
          without undue delay.
        </p>
        <p>
          You may connect only those social accounts that you own or are duly
          authorised to administer. By establishing a connection, you authorise
          the Company to exercise the permissions granted through that
          connection for the purposes of providing the relevant project
          functionality. Social-account connections and assistant authorisations
          may be revoked through the corresponding application settings.
        </p>
      </DocumentSection>
      <DocumentSection
        id="content"
        title="User content, licence, and publication instructions"
      >
        <p>
          You retain any ownership and intellectual property rights that you
          hold in captions, images, videos, and other materials submitted to the
          Service (“User Content”). You grant the Company a non-exclusive,
          royalty-free licence to host, reproduce, process, display, and
          transmit User Content, and to publish it to selected social networks
          pursuant to your instructions, solely to provide the Service. This
          licence includes processing by infrastructure providers engaged for
          those purposes and does not transfer ownership of User Content.
        </p>
        <p>
          You represent that you hold all rights, permissions, and
          authorisations necessary for the submission and intended use of User
          Content, including any applicable intellectual property, image,
          privacy, and data protection rights. Before approving publication, you
          are responsible for reviewing the content for factual accuracy,
          lawfulness, and compliance with the destination network’s
          requirements. This obligation applies equally to content generated or
          assisted by artificial intelligence.
        </p>
        <p>
          Confirmation of publication constitutes an instruction to transmit the
          selected content to the designated accounts. Deletion of a local
          record in Ramblo does not, by itself, remove copies already published
          on third-party networks. A publication request may have an uncertain
          outcome following an interruption or an incomplete response from a
          network; the destination account should be checked before a further
          submission is authorised.
        </p>
      </DocumentSection>
      <DocumentSection
        id="acceptable-use"
        title="Prohibited conduct and enforcement"
      >
        <p>
          You shall not use, or permit another person to use, the Service to:
        </p>
        <ul className="flex list-disc flex-col gap-3 pl-5">
          <li>
            submit, store, transmit, or publish content where doing so would
            contravene applicable law or infringe a third party’s intellectual
            property, privacy, image, confidentiality, or other legally
            protected rights;
          </li>
          <li>
            impersonate another person or entity, misrepresent authority to act
            on their behalf, or use an account or credentials without the
            necessary authorisation;
          </li>
          <li>
            distribute unsolicited communications or engage in other activity
            prohibited by the applicable rules of a connected social network;
          </li>
          <li>
            disclose authentication credentials to persons who are not
            authorised to receive or use them, or obtain access to another
            User’s projects or information without permission; or
          </li>
          <li>
            circumvent access controls, security measures, or usage
            restrictions, introduce malicious code, or interfere with the
            availability, integrity, or operation of the Service.
          </li>
        </ul>
        <p>
          The Company may restrict or suspend access to the extent reasonably
          necessary to investigate or remedy a breach of these Terms, address a
          security threat, or comply with a legal obligation. Where lawful and
          reasonably practicable, the Company will inform the affected User of
          the reason and provide a means of contacting support. Measures taken
          will reflect the nature and seriousness of the circumstances.
        </p>
      </DocumentSection>
      <DocumentSection
        id="third-parties"
        title="Third-party services and platform dependencies"
      >
        <p>
          The Service interoperates with independently operated social networks,
          assistants, automation services, and infrastructure providers. Your
          use of those services remains subject to their respective terms,
          permissions, technical restrictions, and policies. Changes to their
          interfaces, withdrawal of permissions, expiry of credentials, outages,
          or content moderation decisions may affect the availability of a
          connection or the delivery of a publication request.
        </p>
        <p>
          Ramblo is an independent service and is not endorsed by Meta,
          LinkedIn, OpenAI, or Anthropic. The Company does not warrant
          acceptance of content by a third-party network, uninterrupted access
          to a third-party interface, or any particular distribution,
          engagement, or audience reach.
        </p>
      </DocumentSection>
      <DocumentSection id="ending" title="Discontinuation and account closure">
        <p>
          You may discontinue use of the Service, revoke connections, and
          request account deletion in accordance with the{" "}
          <Link className="document-link" href="/data-deletion">
            data deletion procedure
          </Link>
          . Account deletion is available on the User Account page; support
          remains available for requests that cannot be completed there.
        </p>
        <p>
          You remain responsible for disabling separately configured external
          workflows. Revocation of a Ramblo connection does not disable a
          schedule maintained by another service. The retention or deletion of
          information following account closure is governed by the Privacy
          Policy and applicable law. Content previously published to a
          third-party network remains subject to that network’s controls and
          policies.
        </p>
      </DocumentSection>
      <DocumentSection
        id="responsibility"
        title="Liability, governing law, and disputes"
      >
        <p>
          The Company shall exercise reasonable care and skill in providing the
          Service. Any liability arising from the performance or non-performance
          of these Terms shall be determined in accordance with applicable law.
          Nothing in these Terms excludes or restricts liability that cannot
          lawfully be excluded or restricted, or prejudices mandatory consumer
          protections or rights under data protection legislation.
        </p>
        <p>
          These Terms are governed by the laws of Spain, without depriving a
          consumer of any mandatory protection afforded by the law otherwise
          applicable to that consumer. Jurisdiction shall be determined in
          accordance with applicable law; these Terms do not require a consumer
          to submit a dispute to a court contrary to mandatory jurisdiction
          rules. You may contact the Company to seek an amicable resolution,
          without prejudice to your right to pursue any available legal remedy.
        </p>
      </DocumentSection>
      <DocumentSection id="changes" title="Amendments to these Terms">
        <p>
          Revisions to these Terms will be published on this page with an
          updated revision date. Where a revision materially affects existing
          Users, the Company will provide notice through the Service or the
          account email address, together with information about its
          application, as required by law. Any consent required by applicable
          law will be obtained before the relevant change takes effect. If you
          do not wish to continue under revised Terms, you may discontinue use
          and request account closure. Amendments shall not prejudice rights
          that have already accrued.
        </p>
      </DocumentSection>
    </main>
  );
}
