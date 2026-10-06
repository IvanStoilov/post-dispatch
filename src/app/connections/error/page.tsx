import Link from "next/link";
export default function ConnectionError() {
  return (
    <main
      style={{ maxWidth: 560, margin: "80px auto", padding: 24 }}
      className="setup-card"
    >
      <h1>Account connection failed</h1>
      <p>
        Return to Connections and try again. Make sure you grant publishing
        access and use an Instagram Business or Creator account. If your session
        expired, sign in again first.
      </p>
      <Link className="button primary" href="/?connection=failed">
        Return to Connections
      </Link>
    </main>
  );
}
