"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 p-8">
      <h1 className="text-xl font-semibold">Could not load this workspace</h1>
      <p className="text-sm text-muted-foreground">Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
