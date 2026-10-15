import { notFound } from "next/navigation";
import { z } from "zod";
import { workspaceSession } from "@/lib/workspace";
import { getOwnTermsAcceptance } from "@/lib/terms-acceptance";
import { TermsDocument } from "@/components/terms-document";
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await workspaceSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const record = await getOwnTermsAcceptance(user.id, id);
  if (!record) notFound();
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="display-m">Original accepted terms</h1>
      <p className="text-sm text-muted-foreground">
        Accepted{" "}
        <time dateTime={record.acceptedAt.toISOString()}>
          {record.acceptedAt.toISOString()} (UTC)
        </time>{" "}
        · Source: {record.acceptanceSource}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        SHA-256: {record.termsHash}
      </p>
      <TermsDocument content={record.termsContent} />
    </section>
  );
}
