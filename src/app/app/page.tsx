import { redirect } from "next/navigation";
import { appPageUrl } from "@/lib/origins";
import { projectPath } from "@/lib/route-paths";
import { cookies } from "next/headers";
import { workspaceSession } from "@/lib/workspace";
import { projectsService } from "@/domain/projects";
import { ProjectEntry } from "@/components/project-entry";
export default async function Home() {
  const session = await workspaceSession();
  const ids = (await projectsService.list({ userId: session.user.id })).map(
    (p) => p.id,
  );
  const remembered = (await cookies()).get("ramblo-project")?.value;
  if (!ids.length) redirect(appPageUrl("/projects/new"));
  if (remembered && ids.includes(remembered))
    redirect(appPageUrl(projectPath(remembered)));
  return <ProjectEntry ids={ids} remembered={remembered} />;
}
