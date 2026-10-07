import Link from "next/link";
import type { Metadata } from "next";
import {
  DocumentSection,
  PageIntro,
  PolicyDate,
} from "@/components/public/site-shell";
import { site } from "@/lib/public-site";
export const metadata: Metadata = {
  title: "Terms of service | PostDispatch",
  description:
    "The terms for using PostDispatch to receive drafts and publish approved social posts.",
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
        description="The agreement for using PostDispatch, operated by Growth Optimize SL in Spain."
      />
      <PolicyDate />
      <DocumentSection id="agreement" title="Your agreement with us">
        <p>
          These terms govern your use of PostDispatch, provided by{" "}
          {site.operator} ({site.taxId}), at {site.address}. By creating an
          account or using the service, you agree to these terms. You must have
          legal capacity to enter this agreement and authority to act for any
          business or social account you connect.
        </p>
        <p>
          Contact us at{" "}
          <a className="document-link" href={`mailto:${site.email}`}>
            {site.email}
          </a>
          . Our{" "}
          <Link className="document-link" href="/privacy">
            privacy policy
          </Link>{" "}
          describes how personal data is handled.
        </p>
      </DocumentSection>
      <DocumentSection id="service" title="What the service does">
        <p>
          PostDispatch stores drafts, media, projects, and account connections.
          Authorized assistants can submit and read drafts through MCP.
          Publishing is initiated by you in the dashboard. Daily AI generation
          requires a separate scheduled workflow; connecting an assistant alone
          does not create one.
        </p>
        <p>
          The service is developing, and features, supported networks, or usage
          limits may change. We will communicate material changes where
          appropriate. Any paid plan’s price, applicable taxes, renewal, and
          cancellation terms will be presented before purchase; these terms do
          not authorize an unannounced charge.
        </p>
      </DocumentSection>
      <DocumentSection id="account" title="Accounts and authorization">
        <p>
          Provide accurate account information and protect your password,
          session access, and account tokens. Grant access only to assistants
          and automation services you trust. You are responsible for activity
          you authorize and should contact support promptly if you suspect
          unauthorized access.
        </p>
        <p>
          Only connect social accounts you own or are authorized to manage. A
          connection authorizes PostDispatch to use the granted permissions for
          the project’s features. You can disconnect accounts and revoke
          assistant grants in settings.
        </p>
      </DocumentSection>
      <DocumentSection id="content" title="Your content and approval">
        <p>
          You retain your rights in content you submit. You grant us the limited
          rights necessary to store, display, process, transmit, and publish
          that content as instructed through the service. This does not transfer
          ownership of your content to us.
        </p>
        <p>
          You must have the necessary rights and permissions for captions,
          images, videos, personal data, and other material you submit. Review
          AI-generated content for accuracy, intellectual property rights,
          privacy, and suitability before publishing. AI providers can produce
          incorrect or inappropriate material.
        </p>
        <p>
          Clicking Publish instructs us to send the post to the selected
          networks. Deleting the PostDispatch record does not delete a post
          already published elsewhere. A failed or interrupted delivery can have
          an uncertain outcome; check the destination before retrying to avoid
          duplicates.
        </p>
      </DocumentSection>
      <DocumentSection id="acceptable-use" title="Acceptable use">
        <p>
          Do not use the service for unlawful content, impersonation, spam,
          infringement, unauthorized access, credential sharing with
          unauthorized parties, or activity that violates a connected network’s
          rules. Do not attempt to bypass project access controls, usage limits,
          or security measures, or disrupt the service.
        </p>
        <p>
          We may restrict or suspend access where reasonably necessary to
          address misuse, security risks, or legal obligations. Where practical
          and lawful, we will explain the reason and provide a way to contact
          us.
        </p>
      </DocumentSection>
      <DocumentSection id="third-parties" title="Third-party services">
        <p>
          Social networks, AI assistants, automation tools, and hosting services
          have their own policies, permissions, limits, and availability. You
          are responsible for complying with the terms of services you choose.
          Their API changes, revoked permissions, expired tokens, outages, or
          content decisions can prevent publishing or require reconnection.
        </p>
        <p>
          PostDispatch is an independent service and is not endorsed by Meta,
          LinkedIn, OpenAI, or Anthropic. We do not guarantee uninterrupted
          access, publication acceptance, or a particular audience reach.
        </p>
      </DocumentSection>
      <DocumentSection id="ending" title="Ending your use">
        <p>
          You can stop using the service, disconnect your accounts, and request
          account deletion at any time through{" "}
          <Link className="document-link" href="/data-deletion">
            support
          </Link>
          . Also disable external scheduled workflows, because deleting or
          disconnecting a PostDispatch connection does not switch off a separate
          automation service.
        </p>
        <p>
          Information retained after deletion is governed by the privacy policy
          and applicable legal obligations. Published social posts remain
          governed by their respective networks.
        </p>
      </DocumentSection>
      <DocumentSection
        id="responsibility"
        title="Responsibility and applicable law"
      >
        <p>
          We take reasonable care in providing the service. Responsibility for a
          particular loss depends on the circumstances and applicable law.
          Nothing in these terms excludes liability that cannot legally be
          excluded, limits mandatory consumer rights, or removes rights provided
          by data protection law.
        </p>
        <p>
          These terms are governed by Spanish law, subject to any mandatory
          protections and jurisdiction rights that apply in your country.
          Contact us first with a concern so we can try to resolve it.
        </p>
      </DocumentSection>
      <DocumentSection id="changes" title="Changes to these terms">
        <p>
          Changes will be posted here with an updated date. We will give
          appropriate notice of material changes through the service or account
          email. If you do not agree to the changed terms, stop using the
          service and contact us about closing your account.
        </p>
      </DocumentSection>
    </main>
  );
}
