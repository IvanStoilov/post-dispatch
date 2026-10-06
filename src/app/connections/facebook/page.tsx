"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function SelectFacebookPage() {
  const [pages, setPages] = useState<{ id: string; name: string }[]>([]);
  const [project, setProject] = useState("");
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/meta/facebook/pages", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Could not load Pages.");
        if (active) {
          setPages(data.pages);
          setProject(data.projectName);
          setSelected(data.pages[0]?.id || "");
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/meta/facebook/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId: selected }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not connect Page.");
      window.location.assign(data.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Connection failed.");
      setBusy(false);
    }
  }
  return (
    <main style={{ maxWidth: 560, margin: "80px auto", padding: 24 }}>
      <form className="setup-card project-form" onSubmit={save}>
        <h1>Connect a Facebook Page</h1>
        <p>Select the Page to publish to from {project || "your project"}.</p>
        <label>
          Facebook Page
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
              </option>
            ))}
          </select>
        </label>
        <p role="alert">{error}</p>
        <button className="button primary" disabled={busy || !selected}>
          {busy ? "Connecting…" : "Connect selected Page"}
        </button>
        <Link href="/">Cancel and return to PostDispatch</Link>
      </form>
    </main>
  );
}
