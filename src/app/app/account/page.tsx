import { workspaceSession } from "@/lib/workspace";
import { UserAccount } from "@/components/user-account";
import { listTermsAcceptances } from "@/lib/terms-acceptance";
import { currentTerms } from "@/lib/terms";
export default async function AccountPage() {
  const { user } = await workspaceSession();
  const records = await listTermsAcceptances(user.id),
    terms = currentTerms();
  return (
    <UserAccount
      name={user.name}
      email={user.email}
      agreements={records.map((record) => ({
        ...record,
        acceptedAt: record.acceptedAt.toISOString(),
      }))}
      terms={{ version: terms.version, hash: terms.hash }}
    />
  );
}
