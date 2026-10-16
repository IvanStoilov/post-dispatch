import { requireProject } from "@/app/workspace";
import ConnectionsPage from "@/app/connections-workspace";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProject(projectId);
  return <ConnectionsPage key={projectId} />;
}
