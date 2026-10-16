// Shared by server URL builders and client navigation. APIs never use /app.
export function applicationPath(path = "/", cleanHost = false) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Application paths must be relative to the origin");
  }
  const suffix =
    path === "/" || path.startsWith("/?") || path.startsWith("/#")
      ? path.slice(1)
      : path;
  return cleanHost ? path : `/app${suffix}`;
}

export type ProjectSection =
  "inbox" | "published" | "connections" | "assistant";
export function projectPath(
  projectId: string,
  section: ProjectSection = "inbox",
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      projectId,
    )
  ) {
    throw new Error("Invalid project ID");
  }
  return `/projects/${projectId}${section === "inbox" ? "" : `/${section}`}`;
}
