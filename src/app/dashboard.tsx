"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import ProjectSettings from "./project-settings";
import type { Post, Platform, Project } from "@/lib/types";
type View = "Inbox" | "Published" | "Connections" | "MCP integration";
type Draft = Pick<
  Post,
  "title" | "caption" | "imageUrl" | "platforms" | "source"
>;
const blank: Draft = {
  title: "",
  caption: "",
  imageUrl: "",
  platforms: ["facebook"],
  source: "Manual",
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    inbox: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M4 13h5l2 3h2l2-3h5" />
      </>
    ),
    send: (
      <>
        <path d="m3 3 18 9-18 9 4-9-4-9Z" />
        <path d="M7 12h14" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 0-6-6l-2 2" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 5 5" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    code: (
      <>
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-13-2 14" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}
function PlatformBadge({ platform }: { platform: Platform }) {
  return (
    <span className={`platform ${platform}`}>
      <span>{platform === "instagram" ? "◎" : "f"}</span>
      {platform === "instagram" ? "Instagram" : "Facebook"}
    </span>
  );
}
export default function Dashboard({
  user,
}: {
  user: { name: string; email: string };
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const [mcpToken, setMcpToken] = useState("");
  const requestSequence = useRef(0);
  const project = projects.find((p) => p.id === projectId);
  const [posts, setPosts] = useState<Post[]>([]);
  const [view, setView] = useState<View>("Inbox");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [connections, setConnections] = useState({
    facebook: false,
    instagram: false,
    mcp: false,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Draft>(blank);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageFileInput = useRef<HTMLInputElement>(null);
  const [keepImage, setKeepImage] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Post | null>(null);
  const [origin, setOrigin] = useState("");
  const refresh = useCallback(
    async (preferred = projectId) => {
      const sequence = ++requestSequence.current;
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/signin");
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error("Could not load projects");
        const all: Project[] = await response.json();
        const requested =
          preferred || localStorage.getItem("postdispatch-project");
        const selected = all.find((p) => p.id === requested) || all[0];
        if (!selected) throw new Error("Create a project to begin");
        const [p, c] = await Promise.all([
          fetch(`/api/posts?projectId=${selected.id}`, { cache: "no-store" }),
          fetch(`/api/connections?projectId=${selected.id}`),
        ]);
        if (!p.ok || !c.ok) throw new Error("Could not load project workspace");
        const [data, config] = await Promise.all([p.json(), c.json()]);
        if (sequence !== requestSequence.current) return;
        setProjects(all);
        setProjectId(selected.id);
        localStorage.setItem("postdispatch-project", selected.id);
        setOrigin(window.location.origin);
        setPosts(data);
        setConnections(config);
      } catch (e) {
        if (sequence === requestSequence.current)
          setNotice(e instanceof Error ? e.message : "Could not load project");
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [projectId, router],
  );
  useEffect(() => {
    const initial = setTimeout(() => void refresh(projectId), 0);
    const timer = setInterval(() => void refresh(projectId), 15000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [projectId, refresh]);
  function switchProject(id: string) {
    ++requestSequence.current;
    setProjectId(id);
    setPosts([]);
    setNotice("");
    setMcpToken("");
    setCreatingProject(false);
    setLoading(true);
  }
  async function rotateMcpToken() {
    setBusy(true);
    try {
      const result = await request(`/api/projects/${projectId}/token`, "POST");
      setMcpToken(result.mcpToken);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not generate token");
    } finally {
      setBusy(false);
    }
  }
  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(
      url.startsWith("/api/posts") ? `${url}?projectId=${projectId}` : url,
      {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed");
    return result;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await request(
        editing === "new" ? "/api/posts" : `/api/posts/${editing}`,
        editing === "new" ? "POST" : "PATCH",
        {
          ...form,
          keepImage,
          ...(imageFile
            ? {
                imageFile: {
                  dataBase64: await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () =>
                      resolve(String(reader.result).split(",")[1]);
                    reader.onerror = () =>
                      reject(new Error("Could not read image file"));
                    reader.readAsDataURL(imageFile);
                  }),
                  filename: imageFile.name,
                  mimeType: imageFile.type,
                },
              }
            : {}),
        },
      );
      setEditing(null);
      setNotice("Draft saved. Ready when you are.");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!confirm) return;
    setBusy(true);
    const p = confirm;
    setConfirm(null);
    try {
      await request(`/api/posts/${p.id}/publish`, "POST");
      setNotice("Published successfully.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Publishing failed");
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    try {
      await request(`/api/posts/${id}`, "DELETE");
      setEditing(null);
      await refresh();
      setNotice("Draft deleted.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }
  const drafts = posts.filter((p) => p.status !== "published");
  const published = posts.filter((p) => p.status === "published");
  const visible = (view === "Published" ? published : drafts).filter(
    (p) =>
      (filter === "all" || p.platforms.includes(filter as Platform)) &&
      `${p.title} ${p.caption} ${p.source}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  function newDraft() {
    setImageFile(null);
    setKeepImage(false);
    setForm({ ...blank, platforms: ["facebook"] });
    setEditing("new");
  }
  function edit(p: Post) {
    setImageFile(null);
    setKeepImage(!!p.imageUrl);
    setForm({
      title: p.title,
      caption: p.caption,
      imageUrl: "",
      platforms: p.platforms,
      source: p.source,
    });
    setEditing(p.id);
  }
  const nav: [View, string][] = [
    ["Inbox", "inbox"],
    ["Published", "send"],
    ["Connections", "link"],
    ["MCP integration", "code"],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Icon name="send" size={23} />
          </span>
          <span>
            PostDispatch<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">
            {project?.name.charAt(0) || "P"}
          </span>
          <label>
            <small>PROJECT</small>
            <select
              aria-label="Active project"
              value={projectId}
              disabled={busy || !!editing || !!confirm}
              onChange={(e) => switchProject(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className="new-project-button"
          disabled={busy}
          onClick={() => {
            setView("Connections");
            setCreatingProject(true);
          }}
        >
          + New project
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([name, icon]) => (
            <button
              key={name}
              className={`nav-item ${view === name ? "active" : ""}`}
              onClick={() => {
                setView(name);
                setSearch("");
                setFilter("all");
              }}
            >
              <Icon name={icon} />
              <span>{name}</span>
              {name === "Inbox" && <b>{drafts.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="approval-note">
            <span className="little-spark">
              <Icon name="spark" />
            </span>
            <strong>You have the final say.</strong>
            <p>
              AI brings the ideas.
              <br />
              You choose what goes live.
            </p>
          </div>
          <div className="profile">
            <span className="profile-avatar">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div>
              {user.name}
              <small>{user.email}</small>
            </div>
            <button
              className="signout-button"
              onClick={async () => {
                await authClient.signOut();
                localStorage.removeItem("postdispatch-project");
                router.replace("/signin");
                router.refresh();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <strong>{view}</strong>
          </span>
          <span className="topbar-right">
            <span className="online-dot" /> Human approval enabled
          </span>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR PUBLISHING DESK</div>
              <h1>
                {view === "Inbox"
                  ? "Good ideas, ready to go."
                  : view === "Published"
                    ? "Out in the world."
                    : view === "Connections"
                      ? "Connect your channels."
                      : "From conversation to draft."}
              </h1>
              <p>
                {view === "Inbox"
                  ? "A home for your AI drafts. Review, refine, and send them out."
                  : view === "Published"
                    ? "Every post you’ve approved and shared, in one place."
                    : view === "Connections"
                      ? "Give your drafts somewhere to land."
                      : "Let your AI assistant drop its best ideas right into your inbox."}
              </p>
            </div>
            <button className="button primary" onClick={newDraft}>
              <Icon name="plus" size={18} /> New draft
            </button>
          </div>
          {notice && (
            <div className="notice" role="status">
              <span>{notice}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {(view === "Inbox" || view === "Published") && (
            <>
              <div className="stats">
                <div className="stat">
                  <span className="stat-icon mint">
                    <Icon name="inbox" />
                  </span>
                  <div>
                    <small>Awaiting your review</small>
                    <strong>
                      {posts.filter((p) => p.status === "draft").length}
                      <span> drafts</span>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon lavender">
                    <Icon name="send" />
                  </span>
                  <div>
                    <small>Published posts</small>
                    <strong>
                      {published.length}
                      <span> sent out</span>
                    </strong>
                  </div>
                </div>
                <div className="stat">
                  <span className="stat-icon peach">
                    <Icon name="link" />
                  </span>
                  <div>
                    <small>Connected channels</small>
                    <strong>
                      {Number(connections.facebook) +
                        Number(connections.instagram)}
                      <span> of 2 channels</span>
                    </strong>
                  </div>
                  <button
                    className="stat-link"
                    aria-label="Manage connections"
                    onClick={() => setView("Connections")}
                  >
                    <Icon name="arrow" size={19} />
                  </button>
                </div>
              </div>
              <div className="inbox-toolbar">
                <div className="tabs">
                  <button
                    className={filter === "all" ? "selected" : ""}
                    onClick={() => setFilter("all")}
                  >
                    All posts{" "}
                    <span>
                      {view === "Published" ? published.length : drafts.length}
                    </span>
                  </button>
                  <button
                    className={filter === "instagram" ? "selected" : ""}
                    onClick={() => setFilter("instagram")}
                  >
                    Instagram
                  </button>
                  <button
                    className={filter === "facebook" ? "selected" : ""}
                    onClick={() => setFilter("facebook")}
                  >
                    Facebook
                  </button>
                </div>
                <label className="search">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Search posts"
                    placeholder="Search your posts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="section-title">
                <h2>
                  {view === "Published" ? "Published" : "Draft inbox"}{" "}
                  <span>{visible.length}</span>
                </h2>
                <span>Newest first</span>
              </div>
              {loading ? (
                <div className="empty">
                  <Icon name="clock" size={32} />
                  <h3>Opening your inbox…</h3>
                </div>
              ) : visible.length ? (
                <div className="post-grid">
                  {visible.map((p, i) => (
                    <article className="post-card" key={p.id}>
                      <div
                        className={`post-cover cover-${i % 4}`}
                        style={
                          p.imageUrl
                            ? {
                                backgroundImage: `url(${JSON.stringify(p.imageUrl)})`,
                              }
                            : undefined
                        }
                      >
                        {!p.imageUrl && (
                          <div className="cover-art">
                            <span className="cover-kicker">A LITTLE IDEA.</span>
                            <strong>{p.title}</strong>
                            <span className="cover-footer">
                              POSTDISPATCH <Icon name="spark" size={20} />
                            </span>
                          </div>
                        )}
                        <span className={`status-chip ${p.status}`}>
                          <span />
                          {p.status === "draft"
                            ? "Awaiting review"
                            : p.status === "published"
                              ? "Published"
                              : p.status === "publishing"
                                ? "Publishing…"
                                : "Needs review"}
                        </span>
                      </div>
                      <div className="post-body">
                        <div className="platforms">
                          {p.platforms.map((platform) => (
                            <PlatformBadge key={platform} platform={platform} />
                          ))}
                        </div>
                        <h3>{p.title}</h3>
                        <p className="caption">{p.caption}</p>
                        {p.error && <p className="post-error">{p.error}</p>}
                        <div className="post-meta">
                          <span>
                            <Icon
                              name={p.source === "Manual" ? "grid" : "spark"}
                              size={13}
                            />
                            {p.source}
                          </span>
                          <time dateTime={p.createdAt}>
                            {new Date(p.createdAt).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                          </time>
                        </div>
                        <div className="post-actions">
                          {p.status === "draft" ? (
                            <>
                              <button
                                className="button secondary"
                                disabled={busy}
                                onClick={() => edit(p)}
                              >
                                Review & edit
                              </button>
                              <button
                                className="button publish-button"
                                disabled={busy}
                                onClick={() => setConfirm(p)}
                              >
                                Publish <Icon name="arrow" size={16} />
                              </button>
                            </>
                          ) : (
                            <span className="delivery-note">
                              {p.status === "published"
                                ? "✓ Delivered to your channels"
                                : p.status === "publishing"
                                  ? "Delivery in progress. Check Meta if interrupted."
                                  : "Check your channels before resubmitting."}
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <div className="empty-art">
                    <div className="paper-back" />
                    <div className="paper-front">
                      <Icon name="send" size={30} />
                      <i />
                      <i />
                      <i />
                    </div>
                    <span className="empty-spark">✦</span>
                  </div>
                  <h3>
                    {search || filter !== "all"
                      ? "No matching posts"
                      : view === "Published"
                        ? "Your first dispatch is ahead."
                        : "Your next great post starts here."}
                  </h3>
                  <p>
                    {search || filter !== "all"
                      ? "Try another search or channel."
                      : view === "Published"
                        ? "Approved posts will appear here once they’re published."
                        : "Create a draft yourself, or connect an AI assistant\nto fill your inbox with fresh ideas."}
                  </p>
                  {view === "Inbox" && !search && filter === "all" && (
                    <div className="empty-actions">
                      <button className="button primary" onClick={newDraft}>
                        <Icon name="plus" size={17} /> Create your first draft
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => setView("MCP integration")}
                      >
                        Connect your assistant <Icon name="arrow" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="footer-note">
                <Icon name="check" size={14} /> Nothing goes live until you say
                so.
              </div>
            </>
          )}
          {view === "Connections" && (
            <>
              {project && (
                <ProjectSettings
                  key={project.id}
                  project={project}
                  creating={creatingProject}
                  onSaved={() => refresh()}
                  onCreated={async (id, token) => {
                    setCreatingProject(false);
                    setMcpToken("");
                    await refresh(id);
                    setMcpToken(token);
                  }}
                />
              )}
              <section className="info-panel">
                <Icon name="link" />
                <div>
                  <h3>A direct connection to Meta</h3>
                  <p>
                    Create a Meta developer app and grant its publishing
                    permissions. Save the account IDs and access tokens for this
                    project above. Configured means credentials are present; the
                    first publish verifies access. Instagram images must be
                    publicly accessible JPEGs.
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/instagram-platform/content-publishing/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Meta publishing documentation ↗
                  </a>
                </div>
              </section>
            </>
          )}
          {view === "MCP integration" && (
            <>
              <section className="mcp-hero">
                <span className="mcp-icon">
                  <Icon name="spark" size={30} />
                </span>
                <div>
                  <span className="eyebrow">
                    A SHORTER PATH FROM IDEA TO POST
                  </span>
                  <h2>Your assistant. Your inbox.</h2>
                  <p>
                    Send drafts through MCP, then come back here to make them
                    yours.
                  </p>
                </div>
                <span className="connection-state">
                  {connections.mcp ? "Token configured" : "Setup needed"}
                </span>
              </section>
              <div className="setup-grid">
                <section className="setup-card">
                  <span className="step">01</span>
                  <h3>Set up your endpoint</h3>
                  <p>
                    This endpoint is bound to {project?.name}. Use its project
                    token with clients that support bearer authentication.
                  </p>
                  <div className="endpoint">
                    <code>
                      {origin}/api/mcp/{projectId}
                    </code>
                    <button
                      aria-label="Copy MCP endpoint"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `${origin}/api/mcp/${projectId}`,
                          );
                          setNotice("Endpoint copied.");
                        } catch {
                          setNotice(
                            "Copy the endpoint from the text shown here.",
                          );
                        }
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void rotateMcpToken()}
                  >
                    {connections.mcp
                      ? "Replace MCP token"
                      : "Generate MCP token"}
                  </button>
                  {mcpToken && (
                    <div className="token-reveal">
                      <p>Copy this token now. It is shown only once.</p>
                      <code>{mcpToken}</code>
                      <button
                        className="button secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(mcpToken);
                            setNotice("Token copied.");
                          } catch {
                            setNotice("Copy the token shown here.");
                          }
                        }}
                      >
                        Copy token
                      </button>
                    </div>
                  )}
                  <p className="small">
                    Replacing a token disconnects clients using the previous
                    token.
                  </p>
                  <p className="small">
                    Header:{" "}
                    <code>Authorization: Bearer YOUR_PROJECT_TOKEN</code>
                  </p>
                </section>
                <section className="setup-card">
                  <span className="step">02</span>
                  <h3>Give your assistant a brief</h3>
                  <p>Try a prompt like this after connecting your client:</p>
                  <blockquote>
                    “Create a Facebook draft about our latest update. Send it to
                    PostDispatch using create_draft so I can review it.”
                  </blockquote>
                  <p className="small">
                    Remote clients need a public HTTPS URL. Client
                    authentication support varies; OAuth is a next step for
                    broader compatibility.
                  </p>
                </section>
              </div>
              <section className="tools-panel">
                <div>
                  <h3>Your project. Your publishing desk.</h3>
                  <p>
                    Your assistant can identify this project with get_project.
                    It prepares; you publish.
                  </p>
                </div>
                <div>
                  <code>create_draft</code>
                  <span>
                    Submit a post with an image URL or file for your review
                  </span>
                </div>
                <div>
                  <code>list_posts</code>
                  <span>Read drafts and delivery status</span>
                </div>
              </section>
              <section className="info-panel">
                <Icon name="clock" />
                <div>
                  <h3>Want fresh drafts every day?</h3>
                  <p>
                    Connect a scheduler to your AI workflow. It generates the
                    post and calls create_draft; each post waits in this inbox
                    for your approval.
                  </p>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
      {editing && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setEditing(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">MAKE IT YOURS</span>
                <h2 id="draft-title">
                  {editing === "new" ? "A fresh draft." : "Review your draft."}
                </h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close editor"
                onClick={() => setEditing(null)}
                disabled={busy}
              >
                <Icon name="close" />
              </button>
            </div>
            <form onSubmit={save}>
              <label>
                Post title
                <input
                  autoFocus
                  required
                  maxLength={120}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Give this idea a name"
                />
              </label>
              <label>
                Caption
                <textarea
                  required
                  maxLength={2200}
                  rows={6}
                  value={form.caption}
                  onChange={(e) =>
                    setForm({ ...form, caption: e.target.value })
                  }
                  placeholder="What would you like to share?"
                />
                <span className="character-count">
                  {form.caption.length} / 2,200
                </span>
              </label>
              <label>
                Image file
                <input
                  type="file"
                  ref={imageFileInput}
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 8 * 1024 * 1024) {
                      setNotice("Images must be 8 MB or smaller");
                      e.target.value = "";
                      return;
                    }
                    setImageFile(file);
                    if (file) setForm({ ...form, imageUrl: "" });
                  }}
                />
                <small>JPEG, PNG, or WebP up to 8 MB. Stored privately.</small>
              </label>
              {editing !== "new" &&
                !!posts.find((p) => p.id === editing)?.imageUrl && (
                  <label>
                    <input
                      type="checkbox"
                      checked={keepImage}
                      onChange={(e) => setKeepImage(e.target.checked)}
                    />{" "}
                    Keep the current image unless replaced
                  </label>
                )}
              <label>
                Image URL{" "}
                <span className="optional">optional for Facebook</span>
                <input
                  type="url"
                  value={form.imageUrl}
                  onChange={(e) => {
                    setForm({ ...form, imageUrl: e.target.value });
                    setImageFile(null);
                    if (imageFileInput.current)
                      imageFileInput.current.value = "";
                  }}
                  placeholder="https://…/image.jpg"
                />
                <small>
                  Or paste a public HTTPS image URL. We download and store it
                  privately. Instagram requires an image.
                </small>
              </label>
              <div className="form-channels">
                <span>Publish to</span>
                {(["facebook", "instagram"] as Platform[]).map((p) => (
                  <label key={p}>
                    <input
                      type="checkbox"
                      checked={form.platforms.includes(p)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          platforms: e.target.checked
                            ? [...form.platforms, p]
                            : form.platforms.filter((v) => v !== p),
                        })
                      }
                    />
                    <PlatformBadge platform={p} />
                  </label>
                ))}
              </div>
              {notice && (
                <p className="form-message" role="status">
                  {notice}
                </p>
              )}
              <div className="modal-actions">
                {editing !== "new" ? (
                  <button
                    type="button"
                    className="delete-button"
                    disabled={busy}
                    onClick={() => void remove(editing)}
                  >
                    Delete draft
                  </button>
                ) : (
                  <span />
                )}
                <div>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="button primary"
                    disabled={busy || !form.platforms.length}
                  >
                    {busy ? "Saving…" : "Save draft"}
                    <Icon name="check" size={16} />
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="publish-title"
          >
            <span className="stat-icon mint">
              <Icon name="send" size={25} />
            </span>
            <h2 id="publish-title">Ready to send it out?</h2>
            <p>
              “{confirm.title}” will be published now to{" "}
              {confirm.platforms.join(" and ")}.
            </p>
            <p className="small">
              This creates a real post on your connected accounts.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setConfirm(null)}
              >
                Keep reviewing
              </button>
              <button className="button primary" onClick={() => void publish()}>
                Publish now <Icon name="arrow" size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
