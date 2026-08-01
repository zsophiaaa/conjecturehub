"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Client half of the curator moderation queue.
 */

interface PendingComment {
  id: number;
  conjectureId: string;
  bodyHtml: string;
  author: string;
  createdAt: string;
}
interface PendingDifficulty {
  id: number;
  conjectureId: string;
  tag: string;
  tagLabel: string;
  author: string;
  createdAt: string;
}
interface PendingClaim {
  id: number;
  conjectureId: string;
  claimType: string;
  sourceUrl: string;
  author: string;
  createdAt: string;
}
interface PendingProof {
  id: number;
  conjectureId: string;
  leanPreview: string;
  author: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ModerationQueue({
  initialComments,
  initialDifficulty,
  initialClaims,
  initialProofs,
}: {
  initialComments: PendingComment[];
  initialDifficulty: PendingDifficulty[];
  initialClaims: PendingClaim[];
  initialProofs: PendingProof[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [claims, setClaims] = useState(initialClaims);
  const [proofs, setProofs] = useState(initialProofs);
  const [error, setError] = useState<string | null>(null);

  async function decide(
    kind: "comment" | "difficulty" | "claim" | "proof",
    id: number,
    decision: "approved" | "rejected",
  ) {
    setError(null);
    try {
      const res = await fetch("/api/moderation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, id, decision }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      if (kind === "comment") setComments((cs) => cs.filter((c) => c.id !== id));
      else if (kind === "difficulty") setDifficulty((ds) => ds.filter((d) => d.id !== id));
      else if (kind === "claim") setClaims((cs) => cs.filter((c) => c.id !== id));
      else setProofs((ps) => ps.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const empty =
    comments.length === 0 &&
    difficulty.length === 0 &&
    claims.length === 0 &&
    proofs.length === 0;

  return (
    <div className="space-y-10">
      {error ? (
        <p className="ui-alert">
          {error}
        </p>
      ) : null}

      {empty ? (
        <p className="ui-panel px-4 py-6 text-center text-ink-muted">
          Nothing awaiting review.
        </p>
      ) : null}

      {comments.length > 0 ? (
        <section className="space-y-3">
          <h2 className="ui-label">
            Comments ({comments.length})
          </h2>
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="ui-panel p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <span className="font-medium text-ink">{c.author}</span>
                  <span>on</span>
                  <Link href={`/conjectures/${c.conjectureId}/`} className="font-medium">
                    {c.conjectureId}
                  </Link>
                  <span className="ml-auto tabular-nums">{formatDate(c.createdAt)}</span>
                </div>
                <div
                  className="prose-comment mt-2 text-sm leading-relaxed text-ink-muted"
                  dangerouslySetInnerHTML={{ __html: c.bodyHtml }}
                />
                <Actions onApprove={() => decide("comment", c.id, "approved")} onReject={() => decide("comment", c.id, "rejected")} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {difficulty.length > 0 ? (
        <section className="space-y-3">
          <h2 className="ui-label">
            Difficulty tags ({difficulty.length})
          </h2>
          <ul className="space-y-3">
            {difficulty.map((d) => (
              <li key={d.id} className="ui-panel p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <span className="font-medium text-ink">{d.author}</span>
                  <span>tagged</span>
                  <Link href={`/conjectures/${d.conjectureId}/`} className="font-medium">
                    {d.conjectureId}
                  </Link>
                  <span className="ml-auto tabular-nums">{formatDate(d.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm text-ink">
                  <span className="rounded-md border border-border-strong bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-muted">
                    {d.tagLabel}
                  </span>
                </p>
                <Actions onApprove={() => decide("difficulty", d.id, "approved")} onReject={() => decide("difficulty", d.id, "rejected")} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {claims.length > 0 ? (
        <section className="space-y-3">
          <h2 className="ui-label">
            Claim proposals ({claims.length})
          </h2>
          <ul className="space-y-3">
            {claims.map((c) => (
              <li key={c.id} className="ui-panel p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <span className="font-medium text-ink">{c.author}</span>
                  <span>{c.claimType}</span>
                  <Link href={`/conjectures/${c.conjectureId}/`} className="font-medium">
                    {c.conjectureId}
                  </Link>
                  <span className="ml-auto tabular-nums">{formatDate(c.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm">
                  <a href={c.sourceUrl} className="break-all">
                    {c.sourceUrl}
                  </a>
                </p>
                <Actions onApprove={() => decide("claim", c.id, "approved")} onReject={() => decide("claim", c.id, "rejected")} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {proofs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="ui-label">
            Lean proof proposals ({proofs.length})
          </h2>
          <ul className="space-y-3">
            {proofs.map((p) => (
              <li key={p.id} className="ui-panel p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                  <span className="font-medium text-ink">{p.author}</span>
                  <Link href={`/conjectures/${p.conjectureId}/`} className="font-medium">
                    {p.conjectureId}
                  </Link>
                  <span className="ml-auto tabular-nums">{formatDate(p.createdAt)}</span>
                </div>
                <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-surface-2 p-3 text-xs text-ink-muted">
                  {p.leanPreview}
                </pre>
                <Actions onApprove={() => decide("proof", p.id, "approved")} onReject={() => decide("proof", p.id, "rejected")} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Actions({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  return (
    <div className="mt-3 flex gap-2">
      <button type="button" onClick={onApprove} className="ui-btn ui-btn-primary text-sm">
        Approve
      </button>
      <button type="button" onClick={onReject} className="ui-btn text-sm text-ink-muted">
        Reject
      </button>
    </div>
  );
}
