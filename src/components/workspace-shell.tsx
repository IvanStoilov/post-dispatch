"use client";
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Inbox,
  Send,
  Code2,
  Plus,
  LogOut,
  ShieldCheck,
  Cog,
} from "lucide-react";
import { useAppPath } from "./app-navigation";
import { Brand } from "./brand";
import { CreateProjectDialog } from "./create-project-dialog";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "./ui/select";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";
import type { Project } from "@/lib/types";
import { authClient } from "@/lib/auth-client";
import { projectPath, type ProjectSection } from "@/lib/route-paths";
import { api } from "@/lib/api-client";

type Counts = { drafts: number; published: number };
const Workspace = createContext<{
  project?: Project;
  setCounts: (counts: Counts) => void;
} | null>(null);
export function useWorkspace() {
  const value = useContext(Workspace);
  if (!value) {
    throw new Error("Workspace layout missing");
  }
  return value;
}
const navigation = [
  { section: "inbox", label: "Inbox", icon: Inbox },
  { section: "published", label: "Published", icon: Send },
  { section: "connections", label: "Settings", icon: Cog },
  { section: "assistant", label: "MCP integration", icon: Code2 },
] as const;
function Navigation({
  projectId,
  section,
  counts,
}: {
  projectId: string;
  section: ProjectSection;
  counts: Counts;
}) {
  const appPath = useAppPath(),
    { setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      {navigation.map((item) => (
        <SidebarMenuItem key={item.section}>
          <SidebarMenuButton
            asChild
            isActive={section === item.section}
            size="lg"
          >
            <Link
              href={appPath(projectPath(projectId, item.section))}
              aria-current={section === item.section ? "page" : undefined}
              onClick={() => setOpenMobile(false)}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
              {["inbox", "published"].includes(item.section) && (
                <SidebarMenuBadge className="ml-auto pr-0">
                  {item.section === "inbox" ? counts.drafts : counts.published}
                </SidebarMenuBadge>
              )}
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
export function WorkspaceShell({
  projects,
  user,
  children,
}: {
  projects: Project[];
  user: { name: string; email: string };
  children: React.ReactNode;
}) {
  const appPath = useAppPath(),
    router = useRouter(),
    params = useParams<{ projectId?: string }>(),
    pathname = usePathname();
  const project = projects.find((p) => p.id === params.projectId);
  const [creatingProject, setCreatingProject] = useState(false);
  const section =
    navigation.find(
      (item) =>
        item.section !== "inbox" &&
        (pathname.endsWith(`/${item.section}`) ||
          pathname.includes(`/${item.section}/`)),
    )?.section || "inbox";
  const [countState, updateCounts] = useState<{ id?: string; values: Counts }>({
    values: { drafts: 0, published: 0 },
  });
  const setCounts = useCallback(
    (values: Counts) => updateCounts({ id: params.projectId, values }),
    [params.projectId],
  );
  const counts =
    countState.id === params.projectId
      ? countState.values
      : { drafts: 0, published: 0 };
  useEffect(() => {
    if (!project) {
      return;
    }
    localStorage.setItem("ramblo-project", project.id);
    document.cookie = `ramblo-project=${project.id}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    const controller = new AbortController();
    void api.posts
      .list({ projectId: project.id }, { signal: controller.signal })
      .then((posts) =>
        setCounts({
          drafts: posts.filter((p) => p.status !== "published").length,
          published: posts.filter((p) => p.status === "published").length,
        }),
      )
      .catch(() => {});
    return () => controller.abort();
  }, [project, setCounts]);
  return (
    <Workspace.Provider value={{ project, setCounts }}>
      <SidebarProvider>
        <a
          href="#main-content"
          className="sr-only fixed top-4 left-4 rounded-lg bg-card p-3 focus:not-sr-only focus:z-50"
        >
          Skip to content
        </a>
        <Sidebar>
          <SidebarHeader className="px-5 pt-7 pb-5">
            <Brand />
            <div className="pt-6">
              <label
                htmlFor="active-project"
                className="text-xs font-medium text-muted-foreground"
              >
                Your project
              </label>
              <div className="flex gap-2 items-center justify-between">
                {projects.length > 1 ? (
                  <Select
                    value={project?.id || ""}
                    onValueChange={(id) =>
                      router.push(appPath(projectPath(id, section)))
                    }
                  >
                    <SelectTrigger
                      id="active-project"
                      aria-label="Active project"
                    >
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Link
                    href={appPath(
                      projects[0]
                        ? projectPath(projects[0].id)
                        : "/projects/new",
                    )}
                    className="font-medium hover:underline"
                  >
                    {project?.name ||
                      projects[0]?.name ||
                      "Create your first project"}
                  </Link>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2 h-full min-h-10"
                  title="Create a project"
                  aria-label="Create a project"
                  onClick={() => setCreatingProject(true)}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          </SidebarHeader>
          <SidebarContent>
            {project && (
              <SidebarGroup>
                <SidebarGroupLabel>Publishing workspace</SidebarGroupLabel>
                <nav aria-label="Workspace">
                  <Navigation
                    projectId={project.id}
                    section={section}
                    counts={counts}
                  />
                </nav>
              </SidebarGroup>
            )}
          </SidebarContent>
          <SidebarFooter className="gap-5 px-5 pb-5">
            <nav
              aria-label="Help and legal"
              className="flex flex-wrap gap-3 text-xs"
            >
              {["guide", "support", "privacy", "terms"].map((path) => (
                <Link
                  key={path}
                  href={`/${path}`}
                  className="public-link capitalize"
                >
                  {path}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <Link
                href={appPath("/account")}
                aria-label="User account"
                className="min-w-0 flex-1 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={async () => {
                  await authClient.signOut();
                  localStorage.removeItem("ramblo-project");
                  document.cookie = "ramblo-project=; Path=/; Max-Age=0";
                  router.replace(appPath("/signin"));
                  router.refresh();
                }}
              >
                <LogOut />
              </Button>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-card px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <SidebarTrigger />
              <span className="truncate text-sm text-muted-foreground">
                {pathname.endsWith("/account")
                  ? "User account"
                  : project?.name || "Workspace"}
              </span>
              <span aria-hidden="true">/</span>
              <span className="text-sm font-medium">
                {project
                  ? navigation.find((n) => n.section === section)?.label
                  : pathname.endsWith("/account")
                    ? "Settings"
                    : "New project"}
              </span>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              <ShieldCheck />
              Human approval
            </Badge>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-7 px-5 py-8 sm:px-8 lg:py-10"
          >
            {children}
          </main>
        </div>
        {creatingProject && (
          <CreateProjectDialog open onOpenChange={setCreatingProject} />
        )}
      </SidebarProvider>
    </Workspace.Provider>
  );
}
