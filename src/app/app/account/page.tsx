import { workspaceSession } from "@/lib/workspace";
import { UserAccount } from "@/components/user-account";
import { termsService } from "@/domain/terms";
export default async function AccountPage() {
  const { user } = await workspaceSession();
  const agreements = await termsService.listAcceptances({ userId: user.id }),
    terms = termsService.current();
  return (
    <UserAccount
      name={user.name}
      email={user.email}
      agreements={agreements}
      terms={{ version: terms.version, hash: terms.hash }}
    />
  );
}
