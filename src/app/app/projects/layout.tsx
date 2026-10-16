import { workspaceSession } from "@/app/workspace";
import { projectsService } from "@/domain/projects";
import { WorkspaceShell } from "@/components/workspace-shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await workspaceSession();
  return (
    <WorkspaceShell
      projects={await projectsService.list({ userId: session.user.id })}
      user={{ name: session.user.name, email: session.user.email }}
    >
      {children}
    </WorkspaceShell>
  );
}
