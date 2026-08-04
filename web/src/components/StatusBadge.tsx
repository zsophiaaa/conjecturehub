import type { Attestation, DerivedStatus, EvidenceTier } from "@/lib/corpus";

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

/**
 * Statuses where the difference between reading the proof and reading about it
 * changes how much weight the label carries. "Open" does not need the marker;
 * "Proved" very much does.
 */
const RESOLUTIONS = new Set([
  "proved",
  "disproved",
  "independent",
  "resolved_by_prior_literature",
]);

export function StatusChip({
  statusKey,
  tier,
  attestation = null,
  scoped = false,
  size = "md",
}: {
  statusKey: string;
  tier: EvidenceTier | null;
  attestation?: Attestation | null;
  scoped?: boolean;
  size?: "sm" | "md";
}) {
  const base = STATUS_STYLES[statusKey] ?? FALLBACK;
  const machineVerified = tier === "machine_verified";

  // At the lowest tier nobody has checked the argument, so the chip reports that a
  // resolution was claimed rather than asserting it. The tick mark in particular
  // reads as our endorsement, which is the opposite of what this tier means.
  const style =
    tier === "unverified_claim" && RESOLUTIONS.has(statusKey)
      ? { label: `Claimed ${base.label.toLowerCase()}`, glyph: "!" }
      : base;

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

      {attestation === "secondary" && RESOLUTIONS.has(statusKey) ? (
        <span
          className={`${chip} ${padding} italic`}
          title="Our basis is someone else's report of this result — a catalogue row or an encyclopedia entry — not the proof itself."
        >
          <span aria-hidden="true">↗</span>
          reported
        </span>
      ) : null}
    </span>
  );
}

export function StatusBadge({ status, size = "md" }: { status: DerivedStatus; size?: "sm" | "md" }) {
  return (
    <StatusChip
      statusKey={status.key}
      tier={status.tier}
      attestation={status.attestation}
      scoped={status.scoped}
      size={size}
    />
  );
}

export function StatusCaveat({ status }: { status: DerivedStatus }) {
  return (
    <p className="ui-alert text-sm">
      <span className="sr-only">Note: </span>
      {status.caveat}
    </p>
  );
}
