"use client";
import { useRouter } from "next/navigation";
import { useWorkspace } from "@/components/workspace-shell";
import ProjectSettings from "./project-settings";
export default function ConnectionsPage() {
  const { project } = useWorkspace();
  const router = useRouter();
  if (!project) throw new Error("No active project");
  return (
    <>
      <div>
        <h1 className="display-m">Project settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your project settings and configurations.
        </p>
      </div>
      <ProjectSettings
        key={project.id + project.name}
        project={project}
        onSaved={async () => router.refresh()}
      />
    </>
  );
}
