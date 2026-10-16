import { requireProject } from "@/app/workspace";

export default async function Layout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  await requireProject((await params).projectId);
  return children;
}
