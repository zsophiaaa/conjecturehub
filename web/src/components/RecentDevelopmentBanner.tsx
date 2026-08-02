import Link from "next/link";
import type { Claim, Conjecture } from "@/lib/corpus";
import { TIER_LABELS } from "@/components/StatusBadge";

const RECENT_CUTOFF = "2026-07-01";

function isRecentMachineVerified(claim: Claim): boolean {
  if (claim.state !== "active" || claim.evidence_tier !== "machine_verified") return false;
  const when = claim.asserted_on ?? claim.recorded_on;
  return when >= RECENT_CUTOFF;
}

function headline(conjecture: Conjecture, claim: Claim): string {
  switch (claim.type) {
    case "counterexample":
      return conjecture.derived.scoped
        ? "Recent counterexample (machine-verified, partial)"
        : "Recent counterexample (machine-verified)";
    case "disproved":
      return "Recently disproved (machine-verified)";
    case "proved":
      return "Recently proved (machine-verified)";
    default:
      return "Recent machine-verified claim";
  }
}

/** Highlights July–August 2026 Mathlib / OpenAI developments on conjecture pages. */
export function RecentDevelopmentBanner({ conjecture }: { conjecture: Conjecture }) {
  const recent = (conjecture.claims ?? [])
    .filter(isRecentMachineVerified)
    .sort((a, b) => (b.asserted_on ?? b.recorded_on).localeCompare(a.asserted_on ?? a.recorded_on));

  const claim = recent[0];
  if (!claim) return null;

  const when = claim.asserted_on ?? claim.recorded_on;
  const ai =
    claim.ai_assistance?.used === "yes"
      ? claim.ai_assistance.systems?.join(", ") ?? "AI assistance declared"
      : null;

  return (
    <aside className="ui-panel space-y-2 border-l-4 border-l-amber-600/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Recent development</p>
      <h2 className="font-serif text-lg text-ink">{headline(conjecture, claim)}</h2>
      <p className="text-sm text-ink-muted">
        Recorded {when}
        {claim.scope ? ` · scope: ${claim.scope}` : ""}
        {" · "}
        {TIER_LABELS[claim.evidence_tier]}
        {ai ? ` · ${ai}` : ""}
        . {claim.notes ?? "See the claim history below for sources and verification receipts."}
      </p>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
        <a href={claim.source.url}>{claim.source.title ?? "Primary source"}</a>
        {claim.verification?.run_url ? (
          <a href={claim.verification.run_url}>Lean certificate / CI</a>
        ) : null}
        <Link href="/">More context on the homepage</Link>
      </p>
    </aside>
  );
}
