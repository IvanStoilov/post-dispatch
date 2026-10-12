"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyText({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard can be blocked; the text stays selectable.
        }
      }}
      className="shrink-0 rounded-xs text-muted-foreground hover:text-foreground"
      aria-label={copied ? "Copied" : label}
    >
      {copied ? (
        <Check className="size-[18px] text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}
