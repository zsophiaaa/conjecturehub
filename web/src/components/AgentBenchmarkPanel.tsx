import Link from "next/link";
import { getStats } from "@/lib/corpus";

/**
 * The curated problem set an agent should start from. Rendered at build time
 * from the same artifact the API serves, so the page and `/index/agent-benchmark.json`
 * can never disagree.
 */
export function AgentBenchmarkPanel() {
  const { agentBenchmark, aiTraceExamples } = getStats();

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Pick a problem</h2>
          <Link href="/conjectures/?benchmark=1" className="text-sm">
            Browse the set →
          </Link>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          A curated set of open problems with Lean formalizations —{" "}
          <strong className="text-ink">not a leaderboard</strong>. Entries marked{" "}
          <span className="font-mono text-xs">CI challenge</span> have a canonical statement in{" "}
          <code>statements/</code>, so a submitted proof can be kernel-checked rather than believed.
          Machine-readable at <Link href="/index/agent-benchmark.json">/index/agent-benchmark.json</Link>.
        </p>

        <ul className="ui-panel mt-3 divide-y divide-border overflow-hidden">
          {agentBenchmark.map((c) => (
            <li key={c.id}>
              <Link
                href={`/conjectures/${c.id}/`}
                className="block px-4 py-3 no-underline hover:bg-surface-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{c.title}</span>
                  {c.difficulty ? (
                    <span className="rounded border border-border-strong px-1.5 py-0.5 text-[11px] text-ink-faint">
                      {c.difficulty}
                    </span>
                  ) : null}
                  {c.hasVerificationChallenge ? (
                    <span className="rounded border border-amber-600/30 bg-amber-600/10 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                      CI challenge
                    </span>
                  ) : null}
                  {c.aiClaimCount > 0 ? (
                    <span className="text-[11px] text-ink-faint">
                      {c.aiClaimCount} AI-assisted claim{c.aiClaimCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
                {c.rationale ? (
                  <span className="mt-1 block text-sm text-ink-muted">{c.rationale}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-xl text-ink">Trace what AI has done</h2>
          <Link href="/conjectures/?ai=1&sort=ai" className="text-sm">
            All AI-assisted records →
          </Link>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Problems where a claim declares AI assistance. Each records the systems used and the role
          they played (discovery, formalization, writing), so you can audit{" "}
          <strong className="text-ink">what a model actually contributed</strong> rather than trusting
          an announcement.
        </p>

        <ul className="ui-panel mt-3 divide-y divide-border overflow-hidden">
          {aiTraceExamples.map((e) => (
            <li key={e.id}>
              <Link
                href={`/conjectures/${e.id}/`}
                className="block px-4 py-3 no-underline hover:bg-surface-2"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{e.title}</span>
                  {e.machineVerified ? (
                    <span className="rounded border border-emerald-600/30 bg-emerald-600/10 px-1.5 py-0.5 text-[11px] text-ink-muted">
                      machine-verified
                    </span>
                  ) : null}
                </span>
                {e.note ? <span className="mt-1 block text-sm text-ink-muted">{e.note}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
