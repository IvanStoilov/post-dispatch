"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-shell";
import { toast } from "@/components/ui/sonner";
import AssistantSettings from "./assistant-settings";
export default function AssistantPage() {
  const { project } = useWorkspace();
  const [settings, setSettings] = useState<{
    configured: boolean;
    grants: { clientId: string; name: string }[];
  }>({ configured: false, grants: [] });
  const [token, setToken] = useState(""),
    [busy, setBusy] = useState(true),
    [origin, setOrigin] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/mcp-settings", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load assistant settings");
        setSettings(await r.json());
        setOrigin(window.location.origin);
      })
      .catch((e) => {
        if (!controller.signal.aborted) toast.error(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, []);
  async function change(path: string, method: string) {
    setBusy(true);
    try {
      const r = await fetch(path, { method });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Request failed");
      if (data.mcpToken) setToken(data.mcpToken);
      const refreshed = await fetch("/api/mcp-settings", { cache: "no-store" });
      if (!refreshed.ok) throw new Error("Could not reload settings");
      setSettings(await refreshed.json());
      toast.success(
        method === "DELETE"
          ? "Assistant disconnected."
          : "MCP token generated.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div>
        <h1 className="display-m">Connect your assistant</h1>
        <p className="text-sm text-muted-foreground">
          Connect once and send drafts to any of your projects.
        </p>
      </div>
      <AssistantSettings
        project={project}
        endpoint={`${origin}/api/mcp`}
        token={token}
        busy={busy}
        configured={settings.configured}
        grants={settings.grants}
        onRotate={() => void change("/api/mcp-settings/token", "POST")}
        onRevoke={(id) =>
          change(
            `/api/mcp-settings/oauth?clientId=${encodeURIComponent(id)}`,
            "DELETE",
          )
        }
      />
    </>
  );
}
