"use client";
import { useState } from "react";
export default function ConsentForm({
  query,
  projectName,
  clientName,
  redirectHost,
  scopes,
}: {
  query: string;
  projectName: string;
  clientName: string;
  redirectHost: string;
  scopes: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function consent(accept: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/oauth/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accept, oauth_query: query }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to connect");
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect");
      setBusy(false);
    }
  }
  return (
    <main className="auth-shell oauth-shell">
      <section className="auth-card">
        <span className="eyebrow">CONNECT YOUR ASSISTANT</span>
        <h1>Connect {projectName}?</h1>
        <p>{clientName} is requesting access to this PostDispatch project.</p>
        <ul>
          {scopes.includes("posts:read") && (
            <li>Read posts and publishing status</li>
          )}
          {scopes.includes("posts:write") && (
            <li>Create drafts for your review</li>
          )}
          {scopes.includes("offline_access") && (
            <li>Keep the connection using renewable access</li>
          )}
        </ul>
        <p>
          Publishing still requires your approval in PostDispatch. Other
          projects stay private.
        </p>
        <small>
          You will return to {redirectHost}. Client names are supplied by the
          requesting app.
        </small>
        {error && <p role="alert">{error}</p>}
        <div className="modal-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void consent(false)}
          >
            Deny
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void consent(true)}
          >
            {busy ? "Connecting…" : "Allow access"}
          </button>
        </div>
      </section>
    </main>
  );
}
