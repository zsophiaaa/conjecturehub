"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import type { ReactNode } from "react";

interface SignInFormProps {
  hasGoogle: boolean;
  hasGitHub?: boolean;
  hasEmail: boolean;
  emailDisabled?: boolean;
  emailDisabledReason?: string;
  googleButton: ReactNode;
  githubButton?: ReactNode;
}

export function SignInForm({
  hasGoogle,
  hasGitHub = false,
  hasEmail,
  emailDisabled = false,
  emailDisabledReason,
  googleButton,
  githubButton,
}: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          Comments, difficulty tags, and collaboration tasks publish immediately during open testing.
          Claim and proof proposals appear as unverified until a curator verifies them.
        </p>
      </div>

      {!hasGoogle && !hasGitHub && !hasEmail ? (
        <div className="ui-alert">
          <p className="text-ink">Sign-in is not configured on this server yet.</p>
          <p className="mt-2">
            Add Google or Resend vars to <code>web/.env.local</code> and restart the dev server. Callback:{" "}
            <code className="text-xs">http://localhost:3000/api/auth/callback/google</code>
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {hasGitHub ? githubButton : null}
        {hasGoogle ? googleButton : null}

        {hasGitHub ? (
          <p className="text-sm text-ink-faint">
            GitHub is the natural choice here: claims become pull requests and proofs are checked in
            CI, so signing in with the account you would be attributed under keeps the record
            consistent. Either provider reaches the same account if the verified email matches.
          </p>
        ) : null}

        {(hasGoogle || hasGitHub) && hasEmail && !emailDisabled ? (
          <p className="text-center text-sm text-ink-faint">or</p>
        ) : null}

        {hasEmail && emailDisabled ? (
          <div className="ui-alert text-sm text-ink-muted">
            <p className="font-medium text-ink">Email magic link unavailable</p>
            <p className="mt-1">
              {emailDisabledReason ??
                "Not enabled on this deployment — Resend's free tier requires a verified domain. Use Google sign-in instead."}
            </p>
          </div>
        ) : null}

        {hasEmail && !emailDisabled ? (
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
