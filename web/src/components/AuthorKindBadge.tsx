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

const VERDICT_STYLES: Record<string, { label: string; className: string }> = {
  verified: {
    label: "verified",
    className:
      "border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  rejected: {
    label: "rejected",
    className: "border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  failed: {
    label: "failed",
    className: "border-red-600/40 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  // Not a rejection: the proof ran out of time, which says nothing about
  // whether it is correct.
  exceeded_budget: {
    label: "over budget",
    className:
      "border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  running: { label: "checking", className: "border-border-strong bg-surface-2 text-ink-muted" },
  pending: { label: "queued", className: "border-border-strong bg-surface-2 text-ink-muted" },
};

/** What the Lean kernel made of a submitted proof, if anything yet. */
export function KernelVerdictBadge({ status }: { status: string | null }) {
  const style = status ? VERDICT_STYLES[status] : undefined;
  const { label, className } = style ?? {
    label: "not checked",
    className: "border-border bg-surface-2 text-ink-faint",
  };
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}
