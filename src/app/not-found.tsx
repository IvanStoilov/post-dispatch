import Link from "next/link";
import { FileQuestion } from "lucide-react";
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
export default function NotFound() {
  return (
    <ConnectionShell>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h1>This page isn’t here</h1>
          </EmptyTitle>
          <EmptyDescription>
            Head back to your workspace to find your projects and posts.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">Back to workspace</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </ConnectionShell>
  );
}
