// Shared by server URL builders and client navigation. APIs never use /app.
export function applicationPath(path = "/", cleanHost = false) {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Application paths must be relative to the origin");
  const suffix =
    path === "/" || path.startsWith("/?") || path.startsWith("/#")
      ? path.slice(1)
      : path;
  return cleanHost ? path : `/app${suffix}`;
}
