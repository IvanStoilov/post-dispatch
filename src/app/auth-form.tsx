"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
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
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (signup && password !== confirmation) {
      setError("Your passwords do not match.");
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
  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">➤</span>
          <span>
            PostDispatch<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="auth-story-content">
          <span className="eyebrow">YOUR PUBLISHING DESK</span>
          <h1>
            Good ideas.
            <br />
            Your final say.
          </h1>
          <p>
            A home for your projects, your AI drafts, and the posts you’re ready
            to share.
          </p>
          <div className="auth-steps">
            <span>
              01 <b>AI drafts</b>
            </span>
            <span>
              02 <b>You approve</b>
            </span>
            <span>
              03 <b>We dispatch</b>
            </span>
          </div>
        </div>
        <small>Thoughtfully prepared. Personally approved.</small>
      </section>
      <section className="auth-main">
        <div className="auth-card">
          <span className="eyebrow">
            {signup ? "MAKE YOURSELF AT HOME" : "BACK TO YOUR DESK"}
          </span>
          <h2>{signup ? "Create your account." : "Welcome back."}</h2>
          <p>
            {signup
              ? "Your projects and publishing plans start here."
              : "Sign in to pick up where you left off."}
          </p>
          <form onSubmit={submit}>
            {signup && (
              <label>
                Your name
                <input
                  autoFocus
                  required
                  autoComplete="name"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ivan"
                />
              </label>
            )}
            <label>
              Email address
              <input
                autoFocus={!signup}
                type="email"
                required
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                maxLength={128}
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={signup ? "At least 8 characters" : "Your password"}
              />
            </label>
            {signup && (
              <label>
                Confirm password
                <input
                  type="password"
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="One more time"
                />
              </label>
            )}
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            <button
              className="button primary auth-submit"
              disabled={busy}
              type="submit"
            >
              {busy
                ? signup
                  ? "Creating your account…"
                  : "Signing in…"
                : signup
                  ? "Create account"
                  : "Sign in"}
              <span>→</span>
            </button>
          </form>
          <div className="auth-switch">
            {signup ? "Already have an account?" : "New to PostDispatch?"}{" "}
            <Link
              href={
                (signup ? "/signin" : "/signup") +
                (oauthQuery ? `?${oauthQuery}` : "")
              }
            >
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
