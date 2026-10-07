"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Brand } from "@/components/brand";
import { FlowPanel } from "@/components/flow-panel";
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
import { ArrowRight, AlertCircle } from "lucide-react";
export default function AuthForm({
  mode,
  oauthQuery,
}: {
  mode: "signin" | "signup";
  oauthQuery?: string;
}) {
  const router = useRouter();
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmationInput = useRef<HTMLInputElement>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (signup && password !== confirmation) {
      setError("Your passwords do not match.");
      confirmationInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const result = signup
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim(),
            password,
            callbackURL: "/",
            ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
            callbackURL: "/",
            ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
          });
      if (result.error) {
        setError(
          result.error.message || "Unable to sign in. Please try again.",
        );
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
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not connect. Please try again.");
      setBusy(false);
    }
  }
  const mismatch = signup && error === "Your passwords do not match.";
  return (
    <main className="grid min-h-svh lg:grid-cols-2">
      <section className="hidden flex-col justify-between border-r px-12 py-10 lg:flex xl:px-20">
        <Brand />
        <div className="mx-auto flex w-full max-w-md flex-col gap-10 py-16">
          <div className="flex flex-col gap-5">
            <p className="text-display font-semibold">
              Your ideas.
              <br />
              Ready for the world.
            </p>
            <p className="max-w-sm text-base leading-relaxed text-muted-foreground">
              One place to turn AI drafts into posts you’re proud to publish.
            </p>
          </div>
          <FlowPanel />
        </div>
      </section>
      <section className="flex min-w-0 flex-col items-center justify-center gap-10 bg-card px-6 py-12 sm:px-10">
        <div className="lg:hidden">
          <Brand />
        </div>
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
            <form id="auth-form" onSubmit={submit}>
              <FieldGroup>
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
                      disabled={busy}
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
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com…"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    maxLength={128}
                    autoComplete={signup ? "new-password" : "current-password"}
                    value={password}
                    disabled={busy}
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
                      disabled={busy}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                    {mismatch && (
                      <FieldError id="confirmation-error">{error}</FieldError>
                    )}
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
                  disabled={busy}
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
            <span>
              {signup ? "Already have an account?" : "New to PostDispatch?"}
            </span>
            <Button variant="link" asChild>
              <Link
                href={
                  (signup ? "/signin" : "/signup") +
                  (oauthQuery ? `?${oauthQuery}` : "")
                }
              >
                {signup ? "Sign in" : "Create an account"}
              </Link>
            </Button>
          </CardFooter>
        </Card>
        <p className="max-w-sm text-center text-xs leading-6 text-muted-foreground">
          {signup ? "By creating an account, you agree to our " : "Read our "}
          <Link className="document-link" href="/terms">
            Terms
          </Link>
          {signup ? ". See how we handle your information in our " : " and "}
          <Link className="document-link" href="/privacy">
            Privacy policy
          </Link>
          .{" "}
          <Link className="document-link" href="/support">
            Need help?
          </Link>
        </p>
      </section>
    </main>
  );
}
