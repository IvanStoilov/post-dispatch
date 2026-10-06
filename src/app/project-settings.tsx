"use client";
import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";
export default function ProjectSettings({
  project,
  creating,
  onCreated,
  onSaved,
}: {
  project: Project;
  creating: boolean;
  onCreated: (id: string, token: string) => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState(project.name);
  const [newName, setNewName] = useState("");
  const [facebookPageId, setFacebookPageId] = useState(project.facebookPageId);
  const [instagramAccountId, setInstagramAccountId] = useState(
    project.instagramAccountId,
  );
  const [facebookPageToken, setFacebookPageToken] = useState("");
  const [instagramAccessToken, setInstagramAccessToken] = useState("");
  const [host, setHost] = useState(project.instagramApiHost);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const status = new URLSearchParams(window.location.search).get(
        "connection",
      );
      if (status === "facebook" || status === "instagram")
        setMessage(
          `${status === "facebook" ? "Facebook" : "Instagram"} connected.`,
        );
      else if (status === "cancelled")
        setMessage("Connection cancelled. Your saved accounts were kept.");
      else if (status === "failed")
        setMessage("Connection failed. Try connecting again.");
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [busy, setBusy] = useState(false);
  async function connect(provider: "facebook" | "instagram") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/meta/${provider}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Could not start connection");
      window.location.assign(result.url);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not connect account",
      );
      setBusy(false);
    }
  }
  async function call(url: string, body: unknown) {
    const response = await fetch(url, {
      method: url.endsWith("/projects") ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save project");
    return result;
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await call(`/api/projects/${project.id}`, {
        name,
        facebookPageId,
        instagramAccountId,
        instagramApiHost: host,
        ...(facebookPageToken ? { facebookPageToken } : {}),
        ...(instagramAccessToken ? { instagramAccessToken } : {}),
      });
      setFacebookPageToken("");
      setInstagramAccessToken("");
      setMessage("Project configuration saved.");
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function disconnect(platform: "facebook" | "instagram") {
    setBusy(true);
    try {
      await call(`/api/projects/${project.id}`, {
        name,
        ...(platform === "facebook"
          ? { facebookPageId: "", facebookPageToken: "" }
          : { instagramAccountId: "", instagramAccessToken: "" }),
      });
      if (platform === "facebook") {
        setFacebookPageId("");
        setFacebookPageToken("");
      } else {
        setInstagramAccountId("");
        setInstagramAccessToken("");
      }
      setMessage("Channel disconnected.");
      await onSaved();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(false);
    }
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await call("/api/projects", { name: newName });
      await onCreated(result.project.id, result.mcpToken);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not create project");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {creating && (
        <form className="setup-card project-form" onSubmit={create}>
          <h3>Create a project</h3>
          <label>
            Project name
            <input
              required
              maxLength={120}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Your brand or business"
            />
          </label>
          <button className="button primary" disabled={busy}>
            Create project
          </button>
          <p className="small">
            Each project has its own posts and channel settings. Generate its
            MCP token in MCP integration.
          </p>
        </form>
      )}
      <form className="project-form" onSubmit={save}>
        <section className="setup-card">
          <label>
            Project name
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </section>
        <div className="connection-grid">
          <section className="connection-card">
            <span className="channel-logo facebook">f</span>
            <span className="connection-state">
              {project.facebookConfigured ? "Configured" : "Not connected"}
            </span>
            <h2>Facebook</h2>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void connect("facebook")}
            >
              {project.facebookConfigured
                ? "Reconnect Facebook"
                : "Connect Facebook"}
            </button>
            <p className="small">
              Authorize publishing and choose your Facebook Page.
            </p>
            <details>
              <summary>Manual configuration</summary>
              <label>
                Page ID
                <input
                  autoComplete="off"
                  value={facebookPageId}
                  onChange={(e) => setFacebookPageId(e.target.value)}
                />
              </label>
              <label>
                Page access token
                <input
                  type="password"
                  autoComplete="new-password"
                  value={facebookPageToken}
                  onChange={(e) => setFacebookPageToken(e.target.value)}
                  placeholder={
                    project.facebookConfigured
                      ? "Saved — leave blank to keep"
                      : "Paste your token"
                  }
                />
              </label>
            </details>
            <button
              type="button"
              className="delete-button"
              disabled={busy}
              onClick={() => void disconnect("facebook")}
            >
              Disconnect Facebook
            </button>
          </section>
          <section className="connection-card">
            <span className="channel-logo instagram">◎</span>
            <span className="connection-state">
              {project.instagramConfigured ? "Configured" : "Not connected"}
            </span>
            <h2>Instagram</h2>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => void connect("instagram")}
            >
              {project.instagramConfigured
                ? "Reconnect Instagram"
                : "Connect Instagram"}
            </button>
            <p className="small">
              Connect a Business or Creator account. No Facebook Page required.
            </p>
            <details>
              <summary>Manual configuration</summary>
              <label>
                Account ID
                <input
                  autoComplete="off"
                  value={instagramAccountId}
                  onChange={(e) => setInstagramAccountId(e.target.value)}
                />
              </label>
              <label>
                Access token
                <input
                  type="password"
                  autoComplete="new-password"
                  value={instagramAccessToken}
                  onChange={(e) => setInstagramAccessToken(e.target.value)}
                  placeholder={
                    project.instagramConfigured
                      ? "Saved — leave blank to keep"
                      : "Paste your token"
                  }
                />
              </label>
              <label>
                Login method
                <select
                  value={host}
                  onChange={(e) =>
                    setHost(e.target.value as Project["instagramApiHost"])
                  }
                >
                  <option value="graph.facebook.com">Facebook Login</option>
                  <option value="graph.instagram.com">Instagram Login</option>
                </select>
              </label>
            </details>
            <button
              type="button"
              className="delete-button"
              disabled={busy}
              onClick={() => void disconnect("instagram")}
            >
              Disconnect Instagram
            </button>
          </section>
        </div>
        <div className="project-save">
          <span role="status">{message}</span>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save project settings"}
          </button>
        </div>
      </form>
    </>
  );
}
