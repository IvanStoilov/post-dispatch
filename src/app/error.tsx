"use client";
import { AlertCircle } from "lucide-react";
import { ConnectionShell } from "@/components/connection-shell";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <ConnectionShell>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h1>Couldn’t open your workspace</h1>
          </EmptyTitle>
          <EmptyDescription>
            Try loading it again. If the problem continues, refresh the page.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={reset}>Try again</Button>
        </EmptyContent>
      </Empty>
    </ConnectionShell>
  );
}
