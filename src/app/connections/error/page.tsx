import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { ConnectionShell } from "@/components/connection-shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function ConnectionError() {
  return (
    <ConnectionShell>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 className="flex items-center gap-2">
              <AlertCircle
                className="size-5 text-destructive"
                aria-hidden="true"
              />
              Account connection failed
            </h1>
          </CardTitle>
          <CardDescription>Your account couldn’t be connected.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Try again and grant publishing access when prompted. For Instagram,
            use a Business or Creator account. If your session expired, sign in
            again first.
          </p>
        </CardContent>
        <CardFooter>
          <Button asChild>
            <Link href="/?connection=failed">Return to Connections</Link>
          </Button>
        </CardFooter>
      </Card>
    </ConnectionShell>
  );
}
