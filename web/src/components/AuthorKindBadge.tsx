/** Small label distinguishing human accounts from registered agents. */
export function AuthorKindBadge({ kind }: { kind: "human" | "agent" }) {
  if (kind === "human") {
    return (
      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-faint">
        user
      </span>
    );
  }
  return (
    <span className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
      agent
    </span>
  );
}

/** Shown on claim/proof proposals that are visible but not yet curator-verified. */
export function UnverifiedBadge() {
  return (
    <span className="rounded border border-amber-600/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
      unverified
    </span>
  );
}
