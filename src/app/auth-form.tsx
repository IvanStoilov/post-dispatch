"use client";
import { useState, useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, AlertCircle, CheckCircle2, MailCheck } from "lucide-react";
import { AuthShell } from "./auth-shell";
import { useAppPath } from "@/components/app-navigation";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
// The server-rendered form must not submit before its client handler is ready.
const subscribeToHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export type AuthNotice =
  "verified" | "verification-failed" | "password-reset" | "account-deleted";
const notices: Record<AuthNotice, { text: string; error?: boolean }> = {
  "account-deleted": {
    text: "Your account has been deleted and access revoked. Stored media is scheduled for permanent removal.",
  },
  verified: { text: "Your email is confirmed. Sign in to continue." },
  "verification-failed": {
    text: "That confirmation link is invalid or has expired. Sign in and we’ll send you a new one.",
    error: true,
  },
  "password-reset": {
    text: "Your password has been changed. Sign in with your new password.",
  },
};
export default function AuthForm({
  mode,
  oauthQuery,
  notice,
  terms,
}: {
  mode: "signin" | "signup";
  oauthQuery?: string;
  notice?: AuthNotice;
  terms?: { version: string; hash: string };
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    clientHydrated,
    serverHydrated,
  );
  const appPath = useAppPath();
  const router = useRouter();
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Set once a confirmation email is on its way; switches to the inbox view.
  const [sentTo, setSentTo] = useState("");
  const [resent, setResent] = useState(false);
  const confirmationInput = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (signup && (!termsAccepted || !terms)) {
      setError("You must read and agree to Ramblo's Terms of Service.");
      return;
    }
    if (signup && password !== confirmation) {
      setError("Your passwords do not match.");
      confirmationInput.current?.focus();
      return;
    }
    setBusy(true);
    // Where the confirmation link lands; /signin forwards signed-in users on.
    const callbackURL = appPath(
      `/signin?${oauthQuery ? `${oauthQuery}&` : ""}verified=1`,
    );
    try {
      const result = signup
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL,
            ...{
              termsAccepted,
              termsVersion: terms?.version,
              termsHash: terms?.hash,
            },
            ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
            callbackURL,
            ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
          });
      if (result.error?.code === "EMAIL_NOT_VERIFIED") {
        // Sign-in re-sends the confirmation link for unverified accounts.
        setSentTo(email.trim());
        setBusy(false);
        return;
      }
      if (result.error) {
        setError(
          result.error.message || "Unable to sign in. Please try again.",
        );
        setBusy(false);
        return;
      }
      if (signup && !result.data?.token) {
        setSentTo(email.trim());
        setBusy(false);
        return;
      }
      if (
        oauthQuery &&
        result.data &&
        "url" in result.data &&
        typeof result.data.url === "string"
      ) {
        window.location.assign(result.data.url);
        return;
      }
      router.replace(appPath());
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    const result = await authClient.sendVerificationEmail({
      email: sentTo,
      callbackURL: appPath(
        `/signin?${oauthQuery ? `${oauthQuery}&` : ""}verified=1`,
      ),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Could not send the email. Try again.");
    } else {
      setResent(true);
    }
  }
  const mismatch = signup && error === "Your passwords do not match.";
  if (sentTo) {
    return (
      <AuthShell>
        <Card className="w-full max-w-sm ring-0">
          <CardHeader>
            <MailCheck className="mb-2 size-8" aria-hidden="true" />
            <CardTitle>
              <h1>Check your inbox</h1>
            </CardTitle>
            <CardDescription>
              {signup ? "We sent" : "Your email isn’t confirmed yet. We sent"} a
              confirmation link to <strong>{sentTo}</strong>. Open it to
              {oauthQuery
                ? " finish connecting your assistant."
                : " start using Ramblo."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {resent && (
              <Alert>
                <CheckCircle2 aria-hidden="true" />
                <AlertDescription>
                  Sent again. It can take a minute to arrive; check your spam
                  folder too.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              variant="outline"
              onClick={resend}
              disabled={busy || resent}
              className="w-full"
            >
              {busy && <Spinner data-icon="inline-start" />}
              Resend email
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <Button
              variant="link"
              onClick={() => {
                setSentTo("");
                setResent(false);
                setError("");
              }}
            >
              Use a different email
            </Button>
          </CardFooter>
        </Card>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <Card className="w-full max-w-sm ring-0">
        <CardHeader>
          <CardTitle>
            <h1>{signup ? "Create your account" : "Welcome back"}</h1>
          </CardTitle>
          <CardDescription>
            {signup
              ? "Bring your projects and posts together."
              : "Sign in to your publishing workspace."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="auth-form" method="post" onSubmit={submit}>
            <FieldGroup>
              {notice && (
                <Alert
                  variant={notices[notice].error ? "destructive" : "default"}
                >
                  {notices[notice].error ? (
                    <AlertCircle aria-hidden="true" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  <AlertDescription>{notices[notice].text}</AlertDescription>
                </Alert>
              )}
              {signup && (
                <Field>
                  <FieldLabel htmlFor="name">Your name</FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    required
                    autoComplete="name"
                    maxLength={120}
                    value={name}
                    disabled={!hydrated || busy}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name…"
                  />
                </Field>
              )}
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
                  disabled={!hydrated || busy}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com…"
                />
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  {!signup && (
                    <Link
                      href={appPath("/forgot-password")}
                      className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={password}
                  disabled={!hydrated || busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {signup && (
                  <FieldDescription>
                    Use at least 8 characters.
                  </FieldDescription>
                )}
              </Field>
              {signup && (
                <Field data-invalid={mismatch}>
                  <FieldLabel htmlFor="confirmation">
                    Confirm password
                  </FieldLabel>
                  <Input
                    ref={confirmationInput}
                    id="confirmation"
                    name="confirmation"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    aria-invalid={mismatch}
                    aria-describedby={
                      mismatch ? "confirmation-error" : undefined
                    }
                    value={confirmation}
                    disabled={!hydrated || busy}
                    onChange={(e) => setConfirmation(e.target.value)}
                  />
                  {mismatch && (
                    <FieldError id="confirmation-error">{error}</FieldError>
                  )}
                </Field>
              )}
              {signup && (
                <Field orientation="horizontal" className="items-start">
                  <Checkbox
                    id="terms-accepted"
                    name="termsAccepted"
                    required
                    checked={termsAccepted}
                    disabled={!hydrated || busy}
                    onCheckedChange={(value) =>
                      setTermsAccepted(value === true)
                    }
                    className="mt-1"
                  />
                  <label
                    htmlFor="terms-accepted"
                    className="text-sm leading-6 cursor-pointer"
                  >
                    I have read and agree to Ramblo&apos;s{" "}
                    <Link
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="document-link"
                    >
                      Terms of Service
                    </Link>
                    .
                  </label>
                </Field>
              )}
              {error && !mismatch && (
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={
                  !hydrated || busy || (signup && (!termsAccepted || !terms))
                }
                className="w-full"
              >
                {busy && <Spinner data-icon="inline-start" />}
                {busy
                  ? signup
                    ? "Creating account…"
                    : "Signing in…"
                  : signup
                    ? "Create account"
                    : "Sign in"}
                {!busy && (
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                )}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-center gap-1.5">
          <span>{signup ? "Already have an account?" : "New to Ramblo?"}</span>
          <Button variant="link" asChild>
            <Link
              href={
                appPath(signup ? "/signin" : "/signup") +
                (oauthQuery ? `?${oauthQuery}` : "")
              }
            >
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </Button>
        </CardFooter>
      </Card>
      <p className="max-w-sm text-center text-xs leading-6 text-muted-foreground">
        Read our{" "}
        <Link className="document-link" href="/terms">
          Terms
        </Link>
        {" and "}
        <Link className="document-link" href="/privacy">
          Privacy policy
        </Link>
        .{" "}
        <Link className="document-link" href="/support">
          Need help?
        </Link>
      </p>
    </AuthShell>
  );
}
