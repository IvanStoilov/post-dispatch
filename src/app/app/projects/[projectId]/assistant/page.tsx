import { requireProject } from "@/app/workspace";
import AssistantPage from "@/app/assistant-workspace";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProject(projectId);
  return <AssistantPage key={projectId} />;
}
