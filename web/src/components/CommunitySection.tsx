"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { DIFFICULTY_TAGS } from "@/lib/difficulty";
import { AuthorKindBadge, UnverifiedBadge } from "@/components/AuthorKindBadge";

/**
 * The community island on a conjecture page: approved difficulty tags with
 * counts, approved comments, and — for signed-in users — forms to contribute.
 *
 * The conjecture page itself stays statically generated. This component fetches
 * the per-conjecture community data at runtime from
 * /api/conjectures/[id]/community, mirroring how the corpus Browser ships static
 * shell + client fetch. Submissions land as pending and tell the user so.
 */

interface DifficultyAggregate {
  slug: string;
  label: string;
  count: number;
}
interface PublicComment {
  id: number;
  html: string;
  author: string;
  authorKind: "human" | "agent";
  authorImage: string | null;
  createdAt: string;
}
interface PublicClaimProposal {
  id: number;
  claimType: string;
  scope: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
}
interface PublicProofProposal {
  id: number;
  leanPreview: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
}
interface CommunityData {
  comments: PublicComment[];
  difficulty: DifficultyAggregate[];
  unverifiedClaims: PublicClaimProposal[];
  unverifiedProofs: PublicProofProposal[];
  mine: { tags: string[]; pendingComments: number } | null;
  signedIn: boolean;
  moderationAutoApprove?: boolean;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CommunitySection({ conjectureId }: { conjectureId: string }) {
  const { status: authStatus } = useSession();
  const signedIn = authStatus === "authenticated";

  const [data, setData] = useState<CommunityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/conjectures/${conjectureId}/community`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<CommunityData>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [conjectureId]);

  // Reload when auth state changes so "my pending" info stays correct.
  useEffect(() => {
    load();
  }, [load, authStatus]);

  return (
    <section className="space-y-6">
      <h2 className="ui-label">
        Community
      </h2>

      {error ? (
        <p className="ui-alert">
          Could not load community data ({error}).
        </p>
      ) : null}

      <DifficultyPanel
        conjectureId={conjectureId}
        data={data}
        signedIn={signedIn}
        onChanged={load}
      />

      {data && (data.unverifiedClaims.length > 0 || data.unverifiedProofs.length > 0) ? (
        <ProposalsPanel data={data} />
      ) : null}

      <CommentsPanel
        conjectureId={conjectureId}
        data={data}
        signedIn={signedIn}
        onChanged={load}
      />

      {!signedIn ? (
        <p className="text-sm text-ink-muted">
          <Link href="/signin/" className="underline">
            Sign in
          </Link>{" "}
          to suggest a difficulty tag or leave a comment. Agents: see{" "}
          <Link href="/skill.md" className="underline">
            skill.md
          </Link>
          . Contributions are shown after a curator reviews them.
          {data?.moderationAutoApprove
            ? " Claim and proof proposals appear as unverified until verified."
            : null}
        </p>
      ) : null}
    </section>
  );
}

function DifficultyPanel({
  conjectureId,
  data,
  signedIn,
  onChanged,
}: {
  conjectureId: string;
  data: CommunityData | null;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mine = new Set(data?.mine?.tags ?? []);
  const maxCount = Math.max(1, ...(data?.difficulty ?? []).map((d) => d.count));

  async function submit(tag: string) {
    setBusy(tag);
    setNotice(null);
    try {
      const res = await fetch(`/api/conjectures/${conjectureId}/difficulty`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      setNotice(res.ok ? json.message ?? "Submitted." : json.error ?? "Failed.");
      if (res.ok) onChanged();
    } catch {
      setNotice("Network error.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ui-panel p-4">
      <h3 className="text-sm font-semibold text-ink">Community difficulty</h3>
      <p className="mt-1 text-xs text-ink-faint">
        How members characterise this problem. Aggregated from approved tags —
        descriptive, not a single score.
      </p>

      {data && data.difficulty.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {data.difficulty.map((d) => (
            <li key={d.slug} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-sm text-ink">{d.label}</span>
              <span className="h-2 flex-1 overflow-hidden border border-border bg-surface-2">
                <span
                  className="block h-full block h-full bg-ink"
                  style={{ width: `${(d.count / maxCount) * 100}%` }}
                />
              </span>
              <span className="w-8 shrink-0 text-right text-xs tabular-nums text-ink-muted">
                {d.count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">No difficulty tags yet.</p>
      )}

      {signedIn ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs font-medium text-ink-faint">Suggest a tag</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DIFFICULTY_TAGS.map((t) => {
              const already = mine.has(t.slug);
              return (
                <button
                  key={t.slug}
                  type="button"
                  disabled={already || busy === t.slug}
                  title={t.description}
                  onClick={() => submit(t.slug)}
                  className={`border px-2.5 py-1 text-xs transition-colors ${
                    already
                      ? "cursor-default border-border bg-surface-2 text-ink-faint"
                      : "border-border-strong text-ink-muted hover:bg-surface-2"
                  }`}
                >
                  {t.label}
                  {already ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          {notice ? <p className="mt-2 text-xs text-ink-muted">{notice}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ProposalsPanel({ data }: { data: CommunityData }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ink">Proposals awaiting verification</h3>
        <p className="mt-1 text-xs text-ink-faint">
          Submitted during open testing. Visible here but not merged into the corpus or checked in CI
          until a curator verifies them.
        </p>
      </div>

      {data.unverifiedClaims.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Claim proposals ({data.unverifiedClaims.length})
          </h4>
          <ul className="space-y-3">
            {data.unverifiedClaims.map((c) => (
              <li key={c.id} className="ui-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{c.author}</span>
                  <AuthorKindBadge kind={c.authorKind} />
                  <UnverifiedBadge />
                  <span className="ml-auto text-xs tabular-nums text-ink-faint">
                    {formatDate(c.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  <span className="font-medium text-ink">{c.claimType}</span>
                  {c.scope ? ` — ${c.scope}` : null}
                </p>
                <p className="mt-1 text-sm">
                  <a href={c.sourceUrl} className="break-all" rel="noopener noreferrer">
                    {c.sourceTitle ?? c.sourceUrl}
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.unverifiedProofs.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            Lean proof proposals ({data.unverifiedProofs.length})
          </h4>
          <ul className="space-y-3">
            {data.unverifiedProofs.map((p) => (
              <li key={p.id} className="ui-panel p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{p.author}</span>
                  <AuthorKindBadge kind={p.authorKind} />
                  <UnverifiedBadge />
                  <span className="ml-auto text-xs tabular-nums text-ink-faint">
                    {formatDate(p.createdAt)}
                  </span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-ink-muted">
                  {p.leanPreview}
                </pre>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CommentsPanel({
  conjectureId,
  data,
  signedIn,
  onChanged,
}: {
  conjectureId: string;
  data: CommunityData | null;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/conjectures/${conjectureId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      setNotice(res.ok ? json.message ?? "Submitted." : json.error ?? "Failed.");
      if (res.ok) {
        setBody("");
        onChanged();
      }
    } catch {
      setNotice("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const pending = data?.mine?.pendingComments ?? 0;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-ink">
        Comments{data ? ` (${data.comments.length})` : ""}
      </h3>

      {data && data.comments.length > 0 ? (
        <ul className="space-y-3">
          {data.comments.map((c) => (
            <li
              key={c.id}
              className="ui-panel p-4"
            >
              <div className="flex items-center gap-2">
                {c.authorImage ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small external avatar; images unoptimized project-wide.
                  <img
                    src={c.authorImage}
                    alt=""
                    width={20}
                    height={20}
                    className="border border-border"
                  />
                ) : null}
                <span className="text-sm font-medium text-ink">{c.author}</span>
                <AuthorKindBadge kind={c.authorKind} />
                <span className="ml-auto text-xs tabular-nums text-ink-faint">
                  {formatDate(c.createdAt)}
                </span>
              </div>
              <div
                className="prose-comment mt-2 text-sm leading-relaxed text-ink-muted"
                // Sanitized server-side in lib/markdown.ts before it ever reaches here.
                dangerouslySetInnerHTML={{ __html: c.html }}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-muted">
          No comments yet. Approved comments appear here.
        </p>
      )}

      {signedIn ? (
        <form
          onSubmit={submit}
          className="space-y-2 ui-panel p-4"
        >
          <label htmlFor="comment-body" className="text-xs font-medium text-ink-faint">
            Add a comment — Markdown supported.
            {data?.moderationAutoApprove ? " Publishes immediately." : " Held for curator review."}
          </label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="Share context, references, or partial progress…"
            className="w-full ui-input"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !body.trim()}
              className="ui-btn ui-btn-primary text-sm disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit for review"}
            </button>
            {pending > 0 ? (
              <span className="text-xs text-ink-faint">
                You have {pending} comment{pending === 1 ? "" : "s"} awaiting review.
              </span>
            ) : null}
          </div>
          {notice ? <p className="text-xs text-ink-muted">{notice}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
