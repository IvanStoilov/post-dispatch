import { Check, FileText, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/* The product's actual workflow, used on the welcome screen and empty inbox. */
export function FlowPanel() {
  return (
    <div
      className="flex flex-col gap-0"
      aria-label="Draft, review, publish workflow"
    >
      {[
        {
          icon: Sparkles,
          title: "Start with an idea",
          text: "Your assistant sends a draft to your project.",
        },
        {
          icon: FileText,
          title: "Make it yours",
          text: "Review the copy, images, and channels.",
        },
        {
          icon: Send,
          title: "Give it the green light",
          text: "Publish to Facebook and Instagram when ready.",
        },
      ].map(({ icon: Icon, title, text }, index) => (
        <div key={title} className="relative flex gap-4 pb-7 last:pb-0">
          {index < 2 && (
            <span
              aria-hidden="true"
              className="absolute top-10 bottom-0 left-5 w-px bg-border"
            />
          )}
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border bg-card text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-1 pt-0.5">
            <p className="text-sm font-semibold">{title}</p>
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {text}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
