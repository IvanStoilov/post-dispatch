"use client";
import { useAppPath } from "@/components/app-navigation";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { AlertCircle, ArrowRight, MailCheck } from "lucide-react";
import { AuthShell } from "./auth-shell";

function BackToSignIn() {
  const appPath = useAppPath();
  return (
    <CardFooter className="justify-center">
      <Button variant="link" asChild>
        <Link href={appPath("/signin")}>Back to sign in</Link>
      </Button>
    </CardFooter>
  );
}
export function ForgotPasswordForm() {
  const appPath = useAppPath();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: appPath("/reset-password"),
      });
      if (result.error)
        setError(result.error.message || "Could not send the email.");
      else setSent(true);
    } catch {
      setError("Could not connect. Please try again.");
    }
    setBusy(false);
  }
  return (
    <AuthShell>
      <Card className="w-full max-w-sm ring-0">
        <CardHeader>
          {sent && <MailCheck className="mb-2 size-8" aria-hidden="true" />}
          <CardTitle>
            <h1>{sent ? "Check your inbox" : "Reset your password"}</h1>
          </CardTitle>
          <CardDescription>
            {sent ? (
              <>
                If an account exists for <strong>{email.trim()}</strong>, we
                sent a link to choose a new password. It expires in 1 hour.
              </>
            ) : (
              "Enter your account email and we’ll send you a reset link."
            )}
          </CardDescription>
        </CardHeader>
        {!sent && (
          <CardContent>
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">Email address</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    spellCheck={false}
                    maxLength={254}
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com…"
                  />
                </Field>
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy}
                  className="w-full"
                >
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? "Sending…" : "Send reset link"}
                  {!busy && (
                    <ArrowRight data-icon="inline-end" aria-hidden="true" />
                  )}
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        )}
        <BackToSignIn />
      </Card>
    </AuthShell>
  );
}
export function ResetPasswordForm({ token }: { token?: string }) {
  const appPath = useAppPath();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const mismatch = error === "Your passwords do not match.";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    if (password !== confirmation) {
      setError("Your passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        setError(
          result.error.code === "INVALID_TOKEN"
            ? "This reset link is invalid or has expired. Request a new one."
            : result.error.message || "Could not reset your password.",
        );
        setBusy(false);
        return;
      }
      router.replace(appPath("/signin?reset=1"));
    } catch {
      setError("Could not connect. Please try again.");
      setBusy(false);
    }
  }
  return (
    <AuthShell>
      <Card className="w-full max-w-sm ring-0">
        <CardHeader>
          <CardTitle>
            <h1>{token ? "Choose a new password" : "Link expired"}</h1>
          </CardTitle>
          <CardDescription>
            {token
              ? "You’ll be signed out on other devices."
              : "This reset link is invalid or has expired. Reset links work once, for 1 hour."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token ? (
            <form onSubmit={submit}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="password">New password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    value={password}
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <FieldDescription>
                    Use at least 8 characters.
                  </FieldDescription>
                </Field>
                <Field data-invalid={mismatch}>
                  <FieldLabel htmlFor="confirmation">
                    Confirm new password
                  </FieldLabel>
                  <Input
                    id="confirmation"
                    name="confirmation"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-invalid={mismatch}
                    value={confirmation}
                    disabled={busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  {mismatch && <FieldError>{error}</FieldError>}
                </Field>
                {error && !mismatch && (
                  <Alert variant="destructive">
                    <AlertCircle aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <Button
                  type="submit"
                  size="lg"
                  disabled={busy}
                  className="w-full"
                >
                  {busy && <Spinner data-icon="inline-start" />}
                  {busy ? "Saving…" : "Save new password"}
                </Button>
              </FieldGroup>
            </form>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link href={appPath("/forgot-password")}>Request a new link</Link>
            </Button>
          )}
        </CardContent>
        <BackToSignIn />
      </Card>
    </AuthShell>
  );
}
