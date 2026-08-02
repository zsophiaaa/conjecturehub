import Link from "next/link";
import type { Claim, Conjecture } from "@/lib/corpus";
import { aiAssistedClaims, machineVerifiedClaims, summarizeAiSystems } from "@/lib/claim-metrics";
import { TIER_LABELS } from "@/components/StatusBadge";

function ClaimLine({ claim }: { claim: Claim }) {
  const when = claim.asserted_on ?? claim.recorded_on;
  const systems = summarizeAiSystems([claim]);
  return (
    <li className="px-4 py-3">
      <p className="text-sm font-medium text-ink capitalize">
        {claim.type.replace(/_/g, " ")}
        {claim.scope ? ` · ${claim.scope}` : ""}
        <span className="ml-2 font-normal text-ink-faint">· {when}</span>
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {TIER_LABELS[claim.evidence_tier]}
        {systems.length ? ` · ${systems.join(", ")}` : ""}
      </p>
      {claim.notes ? (
        <p className="mt-1 text-sm text-ink-muted">
          {claim.notes.length > 280 ? `${claim.notes.slice(0, 280)}…` : claim.notes}
        </p>
      ) : null}
      <p className="mt-2 text-xs">
        <a href={claim.source.url}>{claim.source.title ?? claim.source.url}</a>
        {claim.verification?.run_url ? (
          <>
            {" · "}
            <a href={claim.verification.run_url}>Verification run</a>
          </>
        ) : null}
      </p>
    </li>
  );
}

/** Surfaces AI-assisted and machine-verified claims for agent traceability. */
export function AiTraceSection({ conjecture }: { conjecture: Conjecture }) {
  const ai = aiAssistedClaims(conjecture).sort((a, b) =>
    (b.asserted_on ?? b.recorded_on).localeCompare(a.asserted_on ?? a.recorded_on),
  );
  const aiIds = new Set(ai.map((c) => c.id));
  const verified = machineVerifiedClaims(conjecture).filter((c) => !aiIds.has(c.id));

  if (ai.length === 0 && verified.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">AI &amp; verification trace</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Declared AI assistance and machine-check receipts — who claimed what, not whether it is
          correct.
        </p>
      </div>

      {ai.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-ink">AI-assisted claims ({ai.length})</h3>
          <ul className="ui-panel mt-2 divide-y divide-border">{ai.map((c) => <ClaimLine key={c.id} claim={c} />)}</ul>
        </div>
      ) : null}

      {verified.length > 0 ? (
        <div>
          <h3 className="text-sm font-medium text-ink">Other machine-verified claims ({verified.length})</h3>
          <ul className="ui-panel mt-2 divide-y divide-border">
            {verified.map((c) => (
              <ClaimLine key={c.id} claim={c} />
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm text-ink-muted">
        <Link href="/agents/">Agent API &amp; benchmark set</Link>
      </p>
    </section>
  );
}
