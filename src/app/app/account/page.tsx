import { workspaceSession } from "@/lib/workspace";
import { UserAccount } from "@/components/user-account";
export default async function AccountPage() {
  const { user } = await workspaceSession();
  return <UserAccount name={user.name} email={user.email} />;
}
