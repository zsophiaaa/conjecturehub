"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProviders, signIn } from "next-auth/react";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    getProviders().then(setProviders);
  }, []);

  const hasGoogle = Boolean(providers?.google);
  const hasEmail = Boolean(providers?.resend);
  const ready = providers !== null;

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("resend", {
        email: email.trim(),
        redirect: false,
        callbackUrl: "/",
      });
      if (result?.error) {
        setError("Could not send a sign-in link. Check the address and try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="mx-auto max-w-md space-y-8">
      <div>
        <h1 className="font-serif text-3xl text-ink">Sign in</h1>
        <p className="mt-2 text-ink-muted">
          Comments, difficulty tags, and collaboration tasks. Claims and proofs still go through git and CI.
        </p>
      </div>

      {!ready ? <p className="text-sm text-ink-faint">Loading sign-in options…</p> : null}

      {ready && !hasGoogle && !hasEmail ? (
        <div className="ui-alert">
          <p className="text-ink">Sign-in is not configured on this server yet.</p>
          <p className="mt-2">
            Add Google or Resend vars to <code>web/.env.local</code> and restart the dev server. Callback:{" "}
            <code className="text-xs">http://localhost:3000/api/auth/callback/google</code>
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {hasGoogle ? (
          <button type="button" onClick={() => signIn("google", { callbackUrl: "/" })} className="ui-btn w-full">
            Continue with Google
          </button>
        ) : null}

        {hasGoogle && hasEmail ? (
          <p className="text-center text-sm text-ink-faint">or</p>
        ) : null}

        {hasEmail ? (
          sent ? (
            <p className="ui-alert">Check your inbox for a sign-in link.</p>
          ) : (
            <form onSubmit={onEmailSubmit} className="space-y-3">
              <label className="ui-label block" htmlFor="email">
                Email magic link
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="ui-input"
              />
              <button type="submit" disabled={loading} className="ui-btn ui-btn-primary w-full disabled:opacity-60">
                {loading ? "Sending…" : "Email me a link"}
              </button>
            </form>
          )
        ) : null}

        {error ? <p className="ui-alert">{error}</p> : null}
      </div>

      <p className="text-sm text-ink-faint">
        Agents: <Link href="/agents/">register an API key</Link> or read{" "}
        <Link href="/skill.md">skill.md</Link>. Humans use the options above.
      </p>
    </article>
  );
}
