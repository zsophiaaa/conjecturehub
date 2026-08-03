import { claimFamilies, FAMILY_LABELS, type SystemFamily } from "./ai-systems.js";
import { deriveStatus, TIER_ORDER } from "./status.js";
import type { Claim, Conjecture, EvidenceTier } from "../types.js";

/**
 * Chart series, computed from the YAML corpus at build time.
 *
 * Every series carries its own denominator and the count of records it had to
 * leave out. That is not decoration: an evidence-tier chart drawn over 775
 * claims and an AI-attribution chart drawn over 30 describe the same corpus and
 * mean very different things, and a reader who cannot see which is which will
 * read the second one as if it were the first. The web layer is expected to
 * render `excludedNote` next to the chart rather than in a tooltip.
 *
 * The output is written to web/public/index/series.json alongside the rest of
 * the dataset, so the numbers behind every chart are downloadable rather than
 * trapped in the page that draws them.
 */

export interface SeriesKey {
  key: string;
  label: string;
  total: number;
}

export interface CategorySeries {
  id: string;
  title: string;
  description: string;
  plotted: number;
  excluded: number;
  excludedNote: string | null;
  data: { key: string; label: string; count: number }[];
}

export interface CumulativeSeries {
  id: string;
  title: string;
  description: string;
  plotted: number;
  excluded: number;
  excludedNote: string | null;
  keys: SeriesKey[];
  /** One point per month between the first and last dated item, inclusive. */
  points: { date: string; values: number[] }[];
}

export interface CorpusSeries {
  generatedAt: string;
  categories: CategorySeries[];
  cumulative: CumulativeSeries[];
}

const TIER_LABELS: Record<EvidenceTier, string> = {
  unverified_claim: "Unverified claim",
  preprint: "Preprint",
  published: "Published",
  community_accepted: "Community-accepted",
  machine_verified: "Machine-verified",
};

const CLAIM_TYPE_LABELS: Record<string, string> = {
  proved: "Proved",
  disproved: "Disproved",
  counterexample: "Counterexample",
  partial: "Partial",
  independence: "Independence",
  resolved_by_prior_literature: "Already in the literature",
  reformulation: "Reformulation",
};

const ROLE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  formalization: "Formalization",
  writing: "Writing",
  verification: "Verification",
  search: "Search",
};

const SOURCE_KIND_LABELS: Record<string, string> = {
  arxiv: "arXiv",
  journal: "Journal",
  preprint: "Preprint",
  x: "X",
  mastodon: "Mastodon",
  bluesky: "Bluesky",
  zulip: "Lean Zulip",
  blog: "Blog",
  wikipedia: "Wikipedia",
  hackernews: "Hacker News",
  mathoverflow: "MathOverflow",
  forum: "Problem forum",
  reddit: "Reddit",
  dataset: "Upstream catalogue",
  manual: "Manual entry",
};

/**
 * A claim inherited wholesale from an upstream catalogue tells you about our
 * import schedule. A claim traced to a thread, a preprint or a post tells you
 * about the mathematics. Charting them on one axis buries the second under the
 * first, so they are separated everywhere it matters.
 */
const BULK_IMPORT_KINDS = new Set(["dataset"]);

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

function month(date: string): string {
  return date.slice(0, 7);
}

/** Every month from `first` to `last` inclusive, so a line has no invisible gaps. */
function monthRange(first: string, last: string): string[] {
  const out: string[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  const ly = Number(last.slice(0, 4));
  const lm = Number(last.slice(5, 7));
  while (y < ly || (y === ly && m <= lm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function counted(entries: string[], labels: Record<string, string>, order?: string[]): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e, (counts.get(e) ?? 0) + 1);
  const keys = order ? order.filter((k) => counts.has(k)) : [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!);
  return keys.map((key) => ({ key, label: label(labels, key), count: counts.get(key) ?? 0 }));
}

/**
 * Builds a cumulative monthly series. `items` supply a date and the keys they
 * count toward; an item counting toward two keys adds to both, so the series
 * totals can exceed the number of items and the chart says so.
 */
function cumulative(
  base: Omit<CumulativeSeries, "keys" | "points">,
  items: { date: string; keys: string[] }[],
  labels: Record<string, string>,
  keyOrder?: string[],
): CumulativeSeries {
  const dated = items.filter((i) => /^\d{4}-\d{2}/.test(i.date)).sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length === 0) return { ...base, keys: [], points: [] };

  const totals = new Map<string, number>();
  for (const item of dated) for (const k of item.keys) totals.set(k, (totals.get(k) ?? 0) + 1);

  const keyList = (keyOrder ? keyOrder.filter((k) => totals.has(k)) : [...totals.keys()]).sort(
    (a, b) => (keyOrder ? 0 : (totals.get(b) ?? 0) - (totals.get(a) ?? 0)),
  );

  const months = monthRange(month(dated[0]!.date), month(dated[dated.length - 1]!.date));
  const running = new Map<string, number>(keyList.map((k) => [k, 0]));
  const points = months.map((mo) => {
    for (const item of dated) {
      if (month(item.date) !== mo) continue;
      for (const k of item.keys) {
        if (running.has(k)) running.set(k, running.get(k)! + 1);
      }
    }
    return { date: mo, values: keyList.map((k) => running.get(k)!) };
  });

  return {
    ...base,
    keys: keyList.map((key) => ({ key, label: label(labels, key), total: totals.get(key) ?? 0 })),
    points,
  };
}

function claimDate(claim: Claim): string | null {
  // asserted_on is when the claimant said it. recorded_on is when we wrote it
  // down, which for a bulk-seeded corpus is the day of the import and carries
  // no information about when the mathematics happened.
  return claim.asserted_on ?? null;
}

export function buildSeries(records: Conjecture[]): CorpusSeries {
  const claims = records.flatMap((r) => r.claims ?? []);
  const aiClaims = claims.filter((c) => c.ai_assistance?.used === "yes");
  // A claim can declare AI assistance without naming the system -- some sources
  // say only "an AI research agent". Those belong in the role chart but not in
  // one that attributes work to a lab.
  const attributableAi = aiClaims.filter((c) => (c.ai_assistance?.systems ?? []).length > 0 && claimDate(c));
  const datedAll = claims.filter((c) => claimDate(c));
  const traced = claims.filter((c) => !BULK_IMPORT_KINDS.has(c.source.kind));
  const tracedDated = traced.filter((c) => claimDate(c));

  const categories: CategorySeries[] = [
    {
      id: "claim-type",
      title: "What the claims say",
      description:
        "Every recorded claim by what it asserts. A claim that finds an existing published proof is counted separately from one that produces a new result.",
      plotted: claims.length,
      excluded: 0,
      excludedNote: null,
      data: counted(claims.map((c) => c.type), CLAIM_TYPE_LABELS),
    },
    {
      id: "claim-tier",
      title: "How well checked the claims are",
      description:
        "Evidence tier of every recorded claim. Only the top tier means a proof assistant kernel checked the argument; the rest record who vouched for it and how.",
      plotted: claims.length,
      excluded: 0,
      excludedNote: null,
      data: counted(claims.map((c) => c.evidence_tier), TIER_LABELS, TIER_ORDER),
    },
    {
      id: "ai-role",
      title: "What the model actually did",
      description:
        "Among claims declaring AI assistance, the role the claimant attributed to the model. Recorded from the claimant's own description, not inferred.",
      plotted: aiClaims.filter((c) => c.ai_assistance?.role).length,
      excluded: aiClaims.filter((c) => !c.ai_assistance?.role).length,
      excludedNote: "AI-assisted claims whose source did not say what the model contributed.",
      data: counted(
        aiClaims.flatMap((c) => (c.ai_assistance?.role ? [c.ai_assistance.role] : [])),
        ROLE_LABELS,
      ),
    },
    {
      id: "ai-tier",
      title: "How well checked the AI-assisted claims are",
      description:
        "Evidence tier restricted to claims declaring AI assistance. Worth reading against the tier mix for the corpus as a whole.",
      plotted: aiClaims.length,
      excluded: 0,
      excludedNote: null,
      data: counted(aiClaims.map((c) => c.evidence_tier), TIER_LABELS, TIER_ORDER),
    },
    {
      id: "crosswalk",
      title: "How many catalogues each conjecture appears in",
      description:
        "Counting the Erdős database, Wikidata, formal-conjectures and OEIS. The join between them is the thing this repository exists to maintain, so this is a measure of its own coverage.",
      plotted: records.length,
      excluded: 0,
      excludedNote: null,
      data: (() => {
        const buckets = new Map<number, number>();
        for (const r of records) {
          const ids = r.ids ?? {};
          const n = [
            Boolean(ids.erdos),
            Boolean(ids.wikidata),
            Boolean(ids.formal_conjectures),
            (ids.oeis ?? []).length > 0,
          ].filter(Boolean).length;
          buckets.set(n, (buckets.get(n) ?? 0) + 1);
        }
        return [...buckets]
          .sort((a, b) => a[0] - b[0])
          .map(([n, count]) => ({
            key: String(n),
            label: n === 1 ? "1 catalogue" : `${n} catalogues`,
            count,
          }));
      })(),
    },
  ];

  // Wikipedia's translators are not a jury, and a problem being written up in
  // many languages says nothing about whether it is deep or tractable. It does
  // say the problem escaped its specialty, which is a fact about the world we
  // can count rather than a judgement we would have to invent.
  const measured = records.filter((r) => r.notability?.wikipedia_language_editions != null);
  // deriveStatus calls a record with no claims "open", which is right for a
  // curated entry and wrong for an identity-only stub: Catalan and Kepler both
  // arrive from Wikidata with no claims attached and both were settled decades
  // ago. Requiring a stated basis keeps resolved problems out of a chart that
  // says "open" on the front.
  const stated = measured.filter((r) => r.openness_basis.meaning !== "unknown");
  const openMeasured = stated
    .filter((r) => deriveStatus(r).key === "open")
    .sort(
      (a, b) =>
        b.notability!.wikipedia_language_editions - a.notability!.wikipedia_language_editions,
    );

  categories.push({
    id: "notability-open",
    title: "Open problems that escaped their specialty",
    description:
      "Wikipedia language editions carrying an article on each still-open problem, counted from Wikidata sitelinks. A count of reach, not of importance: nobody translates an article because a problem is hard, and plenty of deep problems appear here with a single-digit count or none at all. Open means the curator we cite records no solution, which is a weaker claim than no solution existing, and records that reached us as bare identities with no stated basis are left out entirely rather than counted as open by default.",
    plotted: Math.min(openMeasured.length, 15),
    excluded: records.length - Math.min(openMeasured.length, 15),
    excludedNote: `Showing the top 15 of ${openMeasured.length} open problems with a measured count. ${records.length - measured.length} of ${records.length} records carry no Wikidata identifier, so no count could be taken, and a further ${measured.length - stated.length} are identity-only stubs whose status we have not established.`,
    data: openMeasured.slice(0, 15).map((r) => ({
      key: r.id,
      label: r.title,
      count: r.notability!.wikipedia_language_editions,
    })),
  });

  const cumulativeSeries: CumulativeSeries[] = [
    cumulative(
      {
        id: "ai-by-lab",
        title: "AI-assisted claims over time, by lab",
        description:
          "Cumulative count of claims declaring AI assistance, grouped by the lab behind the systems named on them. A claim naming systems from two labs counts toward both, so the lines can sum to more than the number of claims.",
        plotted: attributableAi.length,
        excluded: aiClaims.length - attributableAi.length,
        excludedNote:
          "AI-assisted claims whose source gave no date, or named no system to attribute the work to.",
      },
      attributableAi.map((c) => ({
        date: claimDate(c)!,
        keys: claimFamilies(c.ai_assistance?.systems).map((f) => f as string),
      })),
      FAMILY_LABELS as Record<string, string>,
      Object.keys(FAMILY_LABELS) as SystemFamily[],
    ),
    cumulative(
      {
        id: "claims-over-time",
        title: "Recorded claims over time",
        description:
          "Every claim in the corpus, cumulative, by the date the claimant made it. Split by whether we inherited it from an upstream catalogue or traced it to a primary source ourselves.",
        plotted: datedAll.length,
        excluded: claims.length - datedAll.length,
        excludedNote:
          "Claims whose source carries no date. Most are inherited from upstream catalogues that record a resolution without saying when it happened.",
      },
      datedAll.map((c) => ({
        date: claimDate(c)!,
        keys: [BULK_IMPORT_KINDS.has(c.source.kind) ? "inherited" : "traced"],
      })),
      { inherited: "From a catalogue", traced: "Traced to a source" },
      ["inherited", "traced"],
    ),
    cumulative(
      {
        id: "traced-over-time",
        title: "Claims we traced ourselves, by where we found them",
        description:
          "The subset above that did not arrive in a bulk import: claims found in a discussion thread, a preprint or a post and written up with a citation. This is the part of the record that moves between imports, so it is the honest measure of how fast the sweep and its curators are actually working.",
        plotted: tracedDated.length,
        excluded: traced.length - tracedDated.length,
        excludedNote: "Traced claims whose source carries no date.",
      },
      tracedDated.map((c) => ({ date: claimDate(c)!, keys: [c.source.kind] })),
      SOURCE_KIND_LABELS,
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    categories,
    cumulative: cumulativeSeries,
  };
}
