import type { Metadata } from "next";
import Link from "next/link";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { CategoryBars } from "@/components/charts/CategoryBars";
import { CumulativeLines } from "@/components/charts/CumulativeLines";
import { findCategory, findCumulative, getSeries, getStats, SITE } from "@/lib/corpus";

export const metadata: Metadata = {
  title: "Statistics",
  description:
    "What the corpus actually contains: claim types, evidence tiers, AI attribution over time, and how much of the record is cross-linked. Every chart states its denominator.",
};

function Headline({ value, label, hint }: { value: string; label: string; hint: string }) {
  return (
    <div className="ui-panel p-4">
      <div className="font-serif text-2xl tabular-nums text-ink">{value}</div>
      <div className="mt-1 text-sm text-ink">{label}</div>
      <div className="mt-1 text-xs text-ink-faint">{hint}</div>
    </div>
  );
}

export default function StatsPage() {
  const stats = getStats();
  const series = getSeries();
  const n = (value: number) => value.toLocaleString("en-US");

  const totals = stats.claimTotals;
  const claimType = findCategory(series, "claim-type");
  const claimTier = findCategory(series, "claim-tier");
  const aiRole = findCategory(series, "ai-role");
  const aiTier = findCategory(series, "ai-tier");
  const crosswalk = findCategory(series, "crosswalk");
  const notability = findCategory(series, "notability-open");
  const aiByLab = findCumulative(series, "ai-by-lab");
  const claimsOverTime = findCumulative(series, "claims-over-time");
  const tracedOverTime = findCumulative(series, "traced-over-time");

  return (
    <div className="space-y-12">
      <section className="max-w-3xl">
        <h1 className="font-serif text-4xl text-ink">Statistics</h1>
        <p className="mt-4 text-lg text-ink-muted">
          What the record actually contains, computed from the YAML corpus at build time. Every chart
          prints the number of records it plots and the number it had to leave out, because at this
          stage of the field those two numbers are often the most informative thing on the page.
        </p>
      </section>

      <section>
        <h2 className="ui-label">Headline counts</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Headline
            value={n(stats.total)}
            label="Conjectures indexed"
            hint="One YAML file each, merged from three permissively-licensed catalogues"
          />
          <Headline
            value={n(totals.total)}
            label="Recorded claims"
            hint={`${n(totals.dated)} carry a date from their source`}
          />
          <Headline
            value={n(totals.aiAssisted)}
            label="Claims declaring AI assistance"
            hint="Declared by the claimant, never inferred by us"
          />
          <Headline
            value={n(totals.machineVerified)}
            label="Machine-verified claims"
            hint="A proof assistant kernel checked these against our canonical statement"
          />
        </div>
        <p className="mt-3 max-w-3xl text-sm text-ink-muted">
          The gap between the last two is the whole story so far.{" "}
          <strong className="text-ink">
            {totals.aiAssisted} claims say a model helped; {totals.machineVerified} have been checked by a
            kernel.
          </strong>{" "}
          Everything in between rests on a preprint, a forum thread, or a named human saying it looked
          right.
        </p>
      </section>

      {aiByLab ? (
        <section className="space-y-3">
          <h2 className="ui-label">Attribution over time</h2>
          <ChartFrame
            title={aiByLab.title}
            description={aiByLab.description}
            plotted={aiByLab.plotted}
            excluded={aiByLab.excluded}
            excludedNote={aiByLab.excludedNote}
            unit="claims"
          >
            <CumulativeLines series={aiByLab} />
          </ChartFrame>
          <p className="max-w-3xl text-sm text-ink-muted">
            Lab attribution is a normalisation of free text. The corpus stores what the claimant wrote —
            &ldquo;GPT-5.5 Pro&rdquo;, &ldquo;ChatGPT 5.5 Pro&rdquo; and &ldquo;Codex CLI&rdquo; are three
            different strings typed into three different threads — and the grouping into labs happens at
            build time so the source&rsquo;s own wording survives in the record.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="ui-label">What the models contributed</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {aiRole ? (
            <ChartFrame
              title={aiRole.title}
              description={aiRole.description}
              plotted={aiRole.plotted}
              excluded={aiRole.excluded}
              excludedNote={aiRole.excludedNote}
              unit="claims"
            >
              <CategoryBars data={aiRole.data} total={aiRole.plotted} />
            </ChartFrame>
          ) : null}
          {aiTier ? (
            <ChartFrame
              title={aiTier.title}
              description={aiTier.description}
              plotted={aiTier.plotted}
              excluded={aiTier.excluded}
              excludedNote={aiTier.excludedNote}
              unit="claims"
            >
              <CategoryBars data={aiTier.data} total={aiTier.plotted} />
            </ChartFrame>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="ui-label">The corpus as a whole</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {claimType ? (
            <ChartFrame
              title={claimType.title}
              description={claimType.description}
              plotted={claimType.plotted}
              excluded={claimType.excluded}
              excludedNote={claimType.excludedNote}
              unit="claims"
            >
              <CategoryBars data={claimType.data} total={claimType.plotted} />
            </ChartFrame>
          ) : null}
          {claimTier ? (
            <ChartFrame
              title={claimTier.title}
              description={claimTier.description}
              plotted={claimTier.plotted}
              excluded={claimTier.excluded}
              excludedNote={claimTier.excludedNote}
              unit="claims"
            >
              <CategoryBars data={claimTier.data} total={claimTier.plotted} />
            </ChartFrame>
          ) : null}
        </div>
      </section>

      {claimsOverTime ? (
        <section className="space-y-3">
          <h2 className="ui-label">Accumulation</h2>
          <ChartFrame
            title={claimsOverTime.title}
            description={claimsOverTime.description}
            plotted={claimsOverTime.plotted}
            excluded={claimsOverTime.excluded}
            excludedNote={claimsOverTime.excludedNote}
            unit="claims"
          >
            <CumulativeLines series={claimsOverTime} />
          </ChartFrame>
          <p className="max-w-3xl text-sm text-ink-muted">
            Read the step in this chart as a fact about cataloguing, not about mathematics. Claims arrive
            here in bulk when an upstream catalogue is imported, and they carry that catalogue&rsquo;s own
            dates, so a month in which someone did a large data-entry pass looks like a month in which a
            great deal was proved.
          </p>
          {tracedOverTime ? (
            <ChartFrame
              title={tracedOverTime.title}
              description={tracedOverTime.description}
              plotted={tracedOverTime.plotted}
              excluded={tracedOverTime.excluded}
              excludedNote={tracedOverTime.excludedNote}
              unit="claims"
            >
              <CumulativeLines series={tracedOverTime} />
            </ChartFrame>
          ) : null}
        </section>
      ) : null}

      {crosswalk ? (
        <section className="space-y-3">
          <h2 className="ui-label">Coverage</h2>
          <ChartFrame
            title={crosswalk.title}
            description={crosswalk.description}
            plotted={crosswalk.plotted}
            excluded={crosswalk.excluded}
            excludedNote={crosswalk.excludedNote}
            unit="conjectures"
          >
            <CategoryBars data={crosswalk.data} total={crosswalk.plotted} />
          </ChartFrame>
        </section>
      ) : null}

      {notability ? (
        <section className="space-y-3">
          <h2 className="ui-label">Reach</h2>
          <ChartFrame
            title={notability.title}
            description={notability.description}
            plotted={notability.plotted}
            excluded={notability.excluded}
            excludedNote={notability.excludedNote}
            unit="conjectures"
          >
            <CategoryBars data={notability.data} />
          </ChartFrame>
          <p className="max-w-3xl text-sm text-ink-muted">
            This is the closest the site comes to ranking problems, and it is deliberately a proxy
            someone else maintains: the number of Wikipedia language editions with an article,
            counted from Wikidata sitelinks on a stated date. We can be wrong about it only by
            counting wrong, which is checkable. An in-house importance score would not be.
          </p>
        </section>
      ) : null}

      <section className="ui-panel max-w-3xl space-y-3 p-5">
        <h2 className="font-serif text-xl text-ink">What is deliberately not here</h2>
        <p className="text-ink-muted">
          <strong className="text-ink">No significance score.</strong> Ranking conjectures by importance
          means producing a number no source supports. Every other field in this repository carries
          provenance saying where it came from; an estimate of how much a problem matters could not, so
          it does not exist.
        </p>
        <p className="text-ink-muted">
          <strong className="text-ink">No age-at-resolution chart, yet.</strong> It needs the year a
          problem was posed, and the schema has no such field. Adding one means sourcing a date for each
          record rather than inferring it, so the chart waits until the data does.
        </p>
        <p className="text-ink-muted">
          <strong className="text-ink">No leaderboard.</strong> {totals.retracted} claims in the record
          have been retracted and {totals.disputed} are disputed; {totals.priorLiterature} turned out to
          be a proof that already existed in the literature. Those numbers are small today and they are
          the ones worth watching, because a ranking built on unverified claims would move most when the
          record is least reliable.
        </p>
        <p className="text-sm">
          <Link href="/about/">How status is derived from claims</Link>
          {" · "}
          <a href="/index/series.json">Download the numbers behind these charts</a>
          {" · "}
          <a href={SITE.repo}>Corpus on GitHub</a>
        </p>
      </section>
    </div>
  );
}
