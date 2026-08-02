import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getConjecture, getCorpus, type Claim, type Conjecture } from "@/lib/corpus";
import { StatusBadge, StatusCaveat, TIER_LABELS } from "@/components/StatusBadge";
import { RecentDevelopmentBanner } from "@/components/RecentDevelopmentBanner";
import { MathText } from "@/components/MathText";
import { CommunitySection } from "@/components/CommunitySection";

export function generateStaticParams() {
  return getCorpus().map((c) => ({ id: c.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const conjecture = getConjecture(id);
  if (!conjecture) return { title: "Not found" };
  return {
    title: conjecture.title,
    description: `${conjecture.derived.label}. ${conjecture.derived.caveat}`,
  };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="ui-label">{title}</h2>
      {children}
    </section>
  );
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  proved: "Proved",
  disproved: "Disproved",
  counterexample: "Counterexample found",
  partial: "Partial progress",
  independence: "Shown independent",
  resolved_by_prior_literature: "Found already solved in the literature",
  reformulation: "Reformulated",
};

const STATE_STYLES: Record<string, string> = {
  active: "border-border-strong text-ink-muted",
  disputed: "border-border-strong text-ink-muted",
  retracted: "border-border-strong text-ink-faint line-through decoration-1",
};

function ClaimCard({ claim }: { claim: Claim }) {
  const aiUsed = claim.ai_assistance?.used === "yes";

  return (
    <li className="ui-panel p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{CLAIM_TYPE_LABELS[claim.type] ?? claim.type}</span>

        <span className="border border-border-strong px-2 py-0.5 text-xs text-ink-muted">
          {TIER_LABELS[claim.evidence_tier]}
        </span>

        {claim.state !== "active" ? (
          <span className={`border px-2 py-0.5 text-xs ${STATE_STYLES[claim.state]}`}>
            {claim.state}
          </span>
        ) : null}

        {claim.scope ? (
          <span className="border border-border-strong px-2 py-0.5 text-xs text-ink-muted">
            scope: {claim.scope}
          </span>
        ) : null}

        <span className="ml-auto text-xs tabular-nums text-ink-faint">
          {claim.asserted_on ?? claim.recorded_on}
        </span>
      </div>

      {claim.authors && claim.authors.length > 0 ? (
        <p className="mt-2 text-sm text-ink-muted">By {claim.authors.join(", ")}</p>
      ) : null}

      {aiUsed ? (
        <p className="mt-2 text-sm text-ink-muted">
          <span className="font-medium text-ink">AI assistance declared</span>
          {claim.ai_assistance?.systems?.length ? ` — ${claim.ai_assistance.systems.join(", ")}` : ""}
          {claim.ai_assistance?.role ? ` (${claim.ai_assistance.role})` : ""}
        </p>
      ) : null}

      {claim.notes ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{claim.notes}</p> : null}

      {claim.verification ? (
        <div className="ui-panel mt-3 p-3 text-sm">
          <p className="font-medium text-ink">
            <span aria-hidden="true">⛨ </span>
            Machine-checked receipt
          </p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-2">
            <div>
              <dt className="inline font-medium">Tool: </dt>
              <dd className="inline">
                {claim.verification.tool}
                {claim.verification.tool_version ? ` ${claim.verification.tool_version}` : ""}
              </dd>
            </div>
            <div>
              <dt className="inline font-medium">Toolchain: </dt>
              <dd className="inline font-mono">{claim.verification.toolchain}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Theorem: </dt>
              <dd className="inline font-mono">{claim.verification.theorem}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Axioms allowed: </dt>
              <dd className="inline font-mono">{claim.verification.permitted_axioms.join(", ")}</dd>
            </div>
            {claim.verification.second_kernel ? (
              <div>
                <dt className="inline font-medium">Second kernel: </dt>
                <dd className="inline font-mono">{claim.verification.second_kernel}</dd>
              </div>
            ) : null}
          </dl>
          {claim.verification.run_url ? (
            <p className="mt-2">
              <a href={claim.verification.run_url}>View the CI run</a>
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="mt-3 text-sm">
        <span className="text-ink-faint">Source ({claim.source.kind}): </span>
        <a href={claim.source.url}>{claim.source.title ?? claim.source.url}</a>
      </p>

      <p className="mt-1 text-xs text-ink-faint">
        Recorded {claim.recorded_on}
        {claim.reviewer ? ` · reviewed by ${claim.reviewer}` : " · no human reviewer"}
      </p>
    </li>
  );
}

function Identifiers({ conjecture }: { conjecture: Conjecture }) {
  const ids = conjecture.ids ?? {};
  const links: { label: string; value: string; href?: string }[] = [];

  if (ids.erdos) {
    links.push({
      label: "Erdős problem",
      value: `#${ids.erdos}`,
      href: `https://www.erdosproblems.com/${ids.erdos}`,
    });
  }
  if (ids.wikidata) {
    links.push({
      label: "Wikidata",
      value: ids.wikidata,
      href: `https://www.wikidata.org/wiki/${ids.wikidata}`,
    });
  }
  if (ids.wikipedia) links.push({ label: "Wikipedia", value: "article", href: ids.wikipedia });
  if (ids.mathworld) links.push({ label: "MathWorld", value: "entry", href: ids.mathworld });
  if (ids.formal_conjectures) {
    links.push({ label: "formal-conjectures", value: ids.formal_conjectures });
  }
  for (const seq of ids.oeis ?? []) {
    links.push({ label: "OEIS", value: seq, href: `https://oeis.org/${seq}` });
  }
  for (const ext of ids.external ?? []) {
    links.push({ label: "Reference", value: ext.label, href: ext.url });
  }

  if (links.length === 0) return null;

  return (
    <Section title={`Identifiers and links (${links.length})`}>
      <dl className="ui-panel grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2">
        {links.map((link, i) => (
          <div key={`${link.label}-${i}`} className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-ink-faint">{link.label}</dt>
            <dd className="min-w-0 break-words">
              {link.href ? (
                <a href={link.href}>{link.value}</a>
              ) : (
                <span className="font-mono text-xs text-ink-muted">{link.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export default async function ConjecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conjecture = getConjecture(id);
  if (!conjecture) notFound();

  const formal = conjecture.statement?.formal ?? [];
  const claims = [...(conjecture.claims ?? [])].sort((a, b) =>
    (b.asserted_on ?? b.recorded_on).localeCompare(a.asserted_on ?? a.recorded_on),
  );

  return (
    <article className="space-y-10">
      <header className="space-y-4">
        <p className="text-sm">
          <Link href="/conjectures/" className="text-ink-muted no-underline hover:text-ink">
            ← All conjectures
          </Link>
        </p>

        <h1 className="font-serif text-3xl text-ink sm:text-4xl">{conjecture.title}</h1>

        {conjecture.aliases && conjecture.aliases.length > 0 ? (
          <p className="text-sm text-ink-muted">Also known as {conjecture.aliases.join(", ")}</p>
        ) : null}

        <StatusBadge status={conjecture.derived} />
        <StatusCaveat status={conjecture.derived} />
        <RecentDevelopmentBanner conjecture={conjecture} />
      </header>

      {conjecture.statement?.informal ? (
        <Section title="Statement">
          <div className="ui-panel p-5 text-[17px] leading-relaxed">
            <MathText>{conjecture.statement.informal}</MathText>
          </div>
        </Section>
      ) : (
        <Section title="Statement">
          <p className="ui-panel p-5 text-ink-muted">
            We do not hold a copy of this statement. The upstream source&rsquo;s text is not ours to redistribute — follow
            the links below to read it.
          </p>
        </Section>
      )}

      <Section title={`Claim history (${claims.length})`}>
        {claims.length === 0 ? (
          <div className="ui-panel p-5 text-ink-muted">
            <p>No claims have been recorded against this conjecture.</p>
            <p className="mt-2 text-sm">
              {conjecture.openness_basis.asserted_by ? (
                <>
                  Openness asserted by{" "}
                  <span className="font-medium text-ink">{conjecture.openness_basis.asserted_by}</span>
                  {conjecture.openness_basis.asserted_on ? ` on ${conjecture.openness_basis.asserted_on}` : ""}.{" "}
                </>
              ) : null}
              {conjecture.openness_basis.note}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {claims.map((claim) => (
              <ClaimCard key={claim.id} claim={claim} />
            ))}
          </ul>
        )}
      </Section>

      {formal.length > 0 ? (
        <Section title={`Formal statements (${formal.length})`}>
          <p className="text-sm text-ink-muted">
            A machine-verified proof guarantees only that it proves <em>this</em> statement. Whether the statement
            faithfully expresses the conjecture is a separate, human question — which is why each one records its
            reviewer.
          </p>
          <ul className="ui-panel divide-y divide-border overflow-hidden">
            {formal.map((statement, i) => (
              <li key={`${statement.theorem}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                <code className="font-mono text-sm text-ink">{statement.theorem}</code>
                {statement.category ? (
                  <span className="border border-border-strong px-1.5 py-0.5 text-xs text-ink-muted">
                    {statement.category}
                  </span>
                ) : null}
                {statement.definition_hole ? (
                  <span className="border border-border-strong px-1.5 py-0.5 text-xs text-ink-muted">
                    definition hole · human review required
                  </span>
                ) : null}
                <span className="text-xs text-ink-faint">
                  {statement.reviewed_by ? `reviewed by ${statement.reviewed_by}` : "statement not yet reviewed"}
                </span>
                <a href={statement.upstream} className="ml-auto text-sm">
                  {statement.language} @ {statement.toolchain}
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Identifiers conjecture={conjecture} />

      {conjecture.subject?.tags?.length || conjecture.subject?.msc?.length ? (
        <Section title="Subject">
          <div className="flex flex-wrap gap-2">
            {(conjecture.subject?.tags ?? []).map((tag) => (
              <Link
                key={tag}
                href={`/conjectures/?q=${encodeURIComponent(tag)}`}
                className="border border-border-strong bg-surface-1 px-2.5 py-1 text-sm text-ink-muted no-underline hover:bg-surface-2"
              >
                {tag}
              </Link>
            ))}
            {(conjecture.subject?.msc ?? []).map((code) => (
              <span
                key={code}
                className="border border-border bg-surface-2 px-2.5 py-1 font-mono text-sm text-ink-faint"
              >
                MSC {code}
              </span>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Provenance">
        <p className="text-sm text-ink-muted">
          Which upstream source each field came from, under what licence. Sources are mixed, so reuse is judged
          per field rather than per record.
        </p>
        <ul className="space-y-2 text-sm">
          {conjecture.provenance.map((entry, i) => (
            <li key={`${entry.source}-${i}`} className="ui-panel px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-ink">{entry.source}</span>
                <span className="rounded border border-border-strong px-1.5 py-0.5 text-xs text-ink-muted">
                  {entry.license}
                </span>
                {entry.upstream_version ? (
                  <span className="font-mono text-xs text-ink-faint">@ {entry.upstream_version.slice(0, 12)}</span>
                ) : null}
                <span className="text-xs text-ink-faint">retrieved {entry.retrieved}</span>
              </div>
              <p className="mt-1 text-xs text-ink-faint">Covers: {entry.fields.join(", ")}</p>
              {entry.url ? (
                <p className="mt-1 break-words text-xs">
                  <a href={entry.url}>{entry.url}</a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <CommunitySection conjectureId={conjecture.id} />

      <footer className="border-t border-border pt-6 text-sm text-ink-muted">
        <p>
          Something wrong or missing?{" "}
          <a
            href={`https://github.com/zsophiaaa/conjecturehub/edit/main/conjectures/${conjecture.id}.yaml`}
          >
            Edit this record
          </a>{" "}
          — corrections are pull requests, and the full history stays visible.
        </p>
      </footer>
    </article>
  );
}
