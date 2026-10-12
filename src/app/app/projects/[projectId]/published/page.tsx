import { requireProject } from "@/lib/workspace";
import PostsWorkspace from "@/app/posts-workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await requireProject(projectId);
  return <PostsWorkspace key={projectId} publishedView />;
}
