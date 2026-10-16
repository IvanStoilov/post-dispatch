import { workspaceSession } from "@/lib/workspace";
import { listProjects } from "@/domain/projects";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await workspaceSession();
  return (
    <WorkspaceShell
      projects={await listProjects({ userId: session.user.id })}
      user={{ name: session.user.name, email: session.user.email }}
    >
      {children}
    </WorkspaceShell>
  );
}
