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
