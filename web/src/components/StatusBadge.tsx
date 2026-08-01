import type { DerivedStatus, EvidenceTier } from "@/lib/corpus";

interface Style {
  label: string;
  glyph: string;
}

const STATUS_STYLES: Record<string, Style> = {
  open: { label: "Open", glyph: "○" },
  proved: { label: "Proved", glyph: "✓" },
  disproved: { label: "Disproved", glyph: "✗" },
  independent: { label: "Independent", glyph: "⊥" },
  claimed: { label: "Claim recorded", glyph: "!" },
  disputed: { label: "Disputed", glyph: "⚠" },
  partially_resolved: { label: "Partial progress", glyph: "◐" },
  resolved_by_prior_literature: { label: "Already in the literature", glyph: "≡" },
};

const FALLBACK: Style = { label: "Unknown", glyph: "?" };

export const TIER_LABELS: Record<EvidenceTier, string> = {
  unverified_claim: "unverified",
  preprint: "preprint",
  published: "published",
  community_accepted: "community accepted",
  machine_verified: "machine-verified",
};

const chip =
  "inline-flex items-center gap-1 border border-border-strong bg-surface-1 text-ink-muted font-normal";

export function StatusChip({
  statusKey,
  tier,
  scoped = false,
  size = "md",
}: {
  statusKey: string;
  tier: EvidenceTier | null;
  scoped?: boolean;
  size?: "sm" | "md";
}) {
  const style = STATUS_STYLES[statusKey] ?? FALLBACK;
  const machineVerified = tier === "machine_verified";
  const padding = size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-0.5 text-sm";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`${chip} ${padding}`}>
        <span aria-hidden="true">{style.glyph}</span>
        {style.label}
        {scoped ? <span className="opacity-80">· in part</span> : null}
      </span>

      {machineVerified ? (
        <span
          className={`${chip} border-ink text-ink ${padding}`}
          title="A proof assistant kernel checked this against our canonical statement."
        >
          <span aria-hidden="true">⛨</span>
          machine-verified
        </span>
      ) : tier ? (
        <span className={`${chip} ${padding}`}>{TIER_LABELS[tier]}</span>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status, size = "md" }: { status: DerivedStatus; size?: "sm" | "md" }) {
  return <StatusChip statusKey={status.key} tier={status.tier} scoped={status.scoped} size={size} />;
}

export function StatusCaveat({ status }: { status: DerivedStatus }) {
  return (
    <p className="ui-alert text-sm">
      <span className="sr-only">Note: </span>
      {status.caveat}
    </p>
  );
}
