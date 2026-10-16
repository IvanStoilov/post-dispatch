import { notFound } from "next/navigation";
import { z } from "zod";
import { workspaceSession } from "@/lib/workspace";
import { termsService } from "@/domain/terms";
import { UserFacingError } from "@/domain/shared/errors";
import { TermsDocument } from "@/components/terms-document";
export default async function AgreementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await workspaceSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const record = await termsService
    .getAcceptance({ userId: user.id }, { id })
    .catch((error) => {
      if (error instanceof UserFacingError && error.status === 404) notFound();
      throw error;
    });
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <h1 className="display-m">Original accepted terms</h1>
      <p className="text-sm text-muted-foreground">
        Accepted{" "}
        <time dateTime={record.acceptedAt}>{record.acceptedAt} (UTC)</time> ·
        Source: {record.acceptanceSource}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">
        SHA-256: {record.termsHash}
      </p>
      <TermsDocument content={record.termsContent} />
    </section>
  );
}
