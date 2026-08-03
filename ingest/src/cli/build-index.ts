import fs from "node:fs";
import path from "node:path";
import { FIXTURE_IDS, readAll } from "../lib/conjecture.js";
import { deriveStatus } from "../lib/status.js";
import { REPO_ROOT, WEB_INDEX_DIR } from "../lib/paths.js";
import {
  loadAgentBenchmark,
  loadForumActivity,
  hasVerificationChallenge,
} from "../lib/agent-benchmark.js";
import {
  aiAssistedClaimCount,
  forumClaimCount,
  machineVerifiedClaimCount,
} from "../lib/claim-metrics.js";
import { buildSeries } from "../lib/series.js";
import type { Conjecture } from "../types.js";

/**
 * Compiles the YAML corpus into the build artifacts:
 *
 *   web/.generated/corpus.json          full records plus derived status and
 *                                       agent metadata, read at build time to
 *                                       render static pages and serve the API
 *   web/public/index/search.json        compact payload shipped to the browser
 *   web/public/index/agent-benchmark.json  curated set for research agents
 *   web/public/index/series.json        the numbers behind every chart on /stats
 *
 * Anything the API needs is resolved here rather than at request time: a
 * serverless function only ships the files inside `web/`, so reading
 * `statements/` or the YAML corpus from a route handler would work locally and
 * fail in production.
 *
 * At this corpus size a database would be pure overhead: the entire index is a
 * few hundred kilobytes gzipped, so search runs in the browser with no backend
 * and nothing to pay for.
 */

const GENERATED_DIR = path.join(REPO_ROOT, "web", ".generated");

interface SearchEntry {
  /** id */
  i: string;
  /** title */
  t: string;
  /** status key */
  s: string;
  /** evidence tier, empty when there are no claims */
  e: string;
  /** subject tags plus MSC codes */
  g: string[];
  /** searchable alias blob */
  a: string;
  /** true when a Lean statement exists */
  l: 0 | 1;
  /** total claim count */
  c: number;
  /**
   * Counters below are omitted when zero. Most records have none of them, and
   * this payload ships to every visitor, so absent beats `0` here.
   */
  /** forum/reddit-sourced claims we have curated */
  f?: number;
  /** observed comment count on the upstream forum thread, where measured */
  fc?: number;
  /** active claims declaring AI assistance */
  ai?: number;
  /** 1 when an active claim is machine-verified */
  v?: 1;
  /** 1 when listed in benchmarks/agent-challenges.yaml */
  b?: 1;
  /** 1 when statements/challenges/{id}.json exists for comparator */
  k?: 1;
}

const records = readAll();
if (records.length === 0) {
  console.error("No conjectures found. Run `npm run seed` first.");
  process.exit(1);
}

const benchmarkFile = loadAgentBenchmark();
const benchmarkById = new Map(benchmarkFile.challenges.map((c) => [c.id, c]));
const forumActivity = loadForumActivity();

// A typo here would silently drop a problem from the benchmark, so fail loudly.
// `npm run validate` checks the same thing on every pull request.
const unknownBenchmarkIds = [...benchmarkById.keys()].filter(
  (id) => !records.some((r) => r.id === id),
);
if (unknownBenchmarkIds.length > 0) {
  console.error(
    `benchmarks/agent-challenges.yaml references unknown conjecture id(s): ${unknownBenchmarkIds.join(", ")}`,
  );
  process.exit(1);
}

const withStatus = records.map((record: Conjecture) => {
  const benchmark = benchmarkById.get(record.id);
  return {
    ...record,
    derived: deriveStatus(record),
    agent: {
      benchmark: Boolean(benchmark),
      difficulty: benchmark?.difficulty ?? null,
      rationale: benchmark?.rationale ?? null,
      hasVerificationChallenge: hasVerificationChallenge(record.id),
      aiAssistedClaims: aiAssistedClaimCount(record),
      machineVerifiedClaims: machineVerifiedClaimCount(record),
      forumClaims: forumClaimCount(record),
      forumComments: record.ids?.erdos ? (forumActivity.get(record.ids.erdos) ?? null) : null,
    },
  };
});

const indexable = withStatus.filter((r) => !FIXTURE_IDS.has(r.id));

const search: SearchEntry[] = indexable.map((r) => {
  const entry: SearchEntry = {
    i: r.id,
    t: r.title,
    s: r.derived.key,
    e: r.derived.tier ?? "",
    g: [...new Set([...(r.subject?.tags ?? []), ...(r.subject?.msc ?? []).map((m) => `msc:${m}`)])],
    a: (r.aliases ?? []).join(" "),
    l: (r.statement?.formal ?? []).some((f) => f.language === "lean4") ? 1 : 0,
    c: r.claims?.length ?? 0,
  };
  if (r.agent.forumClaims > 0) entry.f = r.agent.forumClaims;
  if (r.agent.forumComments) entry.fc = r.agent.forumComments;
  if (r.agent.aiAssistedClaims > 0) entry.ai = r.agent.aiAssistedClaims;
  if (r.agent.machineVerifiedClaims > 0) entry.v = 1;
  if (r.agent.benchmark) entry.b = 1;
  if (r.agent.hasVerificationChallenge) entry.k = 1;
  return entry;
});

const byStatus: Record<string, number> = {};
const byTier: Record<string, number> = {};
const byTag: Record<string, number> = {};

for (const r of indexable) {
  byStatus[r.derived.key] = (byStatus[r.derived.key] ?? 0) + 1;
  if (r.derived.tier) byTier[r.derived.tier] = (byTier[r.derived.tier] ?? 0) + 1;
  for (const tag of r.subject?.tags ?? []) byTag[tag] = (byTag[tag] ?? 0) + 1;
}

const allClaims = indexable.flatMap((r) => r.claims ?? []);

/**
 * Claim-level counters, as distinct from the record-level ones below. A record
 * with four AI-assisted claims is one entry in `withAiClaims` and four here,
 * and the two answer different questions.
 */
const claimTotals = {
  total: allClaims.length,
  dated: allClaims.filter((c) => c.asserted_on).length,
  aiAssisted: allClaims.filter((c) => c.ai_assistance?.used === "yes").length,
  machineVerified: allClaims.filter((c) => c.evidence_tier === "machine_verified").length,
  disputed: allClaims.filter((c) => c.state === "disputed").length,
  retracted: allClaims.filter((c) => c.state === "retracted").length,
  priorLiterature: allClaims.filter((c) => c.type === "resolved_by_prior_literature").length,
};

const byId = new Map(withStatus.map((r) => [r.id, r]));

const agentBenchmark = benchmarkFile.challenges.map((c) => {
  const record = byId.get(c.id)!;
  return {
    id: c.id,
    title: record.title,
    difficulty: c.difficulty ?? null,
    rationale: c.rationale ?? null,
    statusKey: record.derived.key,
    hasLean: (record.statement?.formal ?? []).some((f) => f.language === "lean4"),
    hasVerificationChallenge: record.agent.hasVerificationChallenge,
    aiClaimCount: record.agent.aiAssistedClaims,
  };
});

const aiTraceExamples = (benchmarkFile.ai_trace_examples ?? [])
  .filter((e) => byId.has(e.id))
  .map((e) => {
    const record = byId.get(e.id)!;
    return {
      id: e.id,
      title: record.title,
      note: e.note ?? null,
      aiClaimCount: record.agent.aiAssistedClaims,
      machineVerified: record.agent.machineVerifiedClaims > 0,
    };
  });

const stats = {
  generatedAt: new Date().toISOString(),
  total: indexable.length,
  claims: indexable.reduce((n, r) => n + (r.claims?.length ?? 0), 0),
  withLeanStatement: search.filter((s) => s.l === 1).length,
  withWikidata: indexable.filter((r) => r.ids?.wikidata).length,
  withErdos: indexable.filter((r) => r.ids?.erdos).length,
  withOeis: indexable.filter((r) => (r.ids?.oeis ?? []).length > 0).length,
  withForumClaims: indexable.filter((r) => r.agent.forumClaims > 0).length,
  withAiClaims: indexable.filter((r) => r.agent.aiAssistedClaims > 0).length,
  withMachineVerified: indexable.filter((r) => r.agent.machineVerifiedClaims > 0).length,
  withVerificationChallenge: indexable.filter((r) => r.agent.hasVerificationChallenge).length,
  agentBenchmarkCount: agentBenchmark.length,
  crossLinked: indexable.filter((r) => {
    const ids = r.ids ?? {};
    const sources = [
      ids.erdos ? 1 : 0,
      ids.wikidata ? 1 : 0,
      ids.formal_conjectures ? 1 : 0,
      (ids.oeis ?? []).length > 0 ? 1 : 0,
    ];
    return sources.reduce((a, b) => a + b, 0) >= 2;
  }).length,
  byStatus,
  byTier,
  topTags: Object.entries(byTag)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([tag, count]) => ({ tag, count })),
  // Ranked by observed upstream comment count where we have one, so the list
  // reflects real activity rather than how much we happen to have curated.
  topDiscussion: indexable
    .filter((r) => (r.agent.forumComments ?? 0) > 0 || r.agent.forumClaims > 0)
    .sort(
      (a, b) =>
        (b.agent.forumComments ?? 0) - (a.agent.forumComments ?? 0) ||
        b.agent.forumClaims - a.agent.forumClaims ||
        a.title.localeCompare(b.title),
    )
    .slice(0, 12)
    .map((r) => ({
      id: r.id,
      title: r.title,
      forumClaims: r.agent.forumClaims,
      forumComments: r.agent.forumComments,
      claims: r.claims?.length ?? 0,
    })),
  agentBenchmark,
  aiTraceExamples,
  claimTotals,
};

const series = buildSeries(indexable);

fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(WEB_INDEX_DIR, { recursive: true });

fs.writeFileSync(path.join(GENERATED_DIR, "corpus.json"), JSON.stringify(withStatus), "utf8");
fs.writeFileSync(path.join(GENERATED_DIR, "stats.json"), JSON.stringify(stats, null, 2), "utf8");
fs.writeFileSync(path.join(GENERATED_DIR, "series.json"), JSON.stringify(series, null, 2), "utf8");
fs.writeFileSync(path.join(WEB_INDEX_DIR, "search.json"), JSON.stringify(search), "utf8");
fs.writeFileSync(path.join(WEB_INDEX_DIR, "stats.json"), JSON.stringify(stats, null, 2), "utf8");
fs.writeFileSync(path.join(WEB_INDEX_DIR, "series.json"), JSON.stringify(series, null, 2), "utf8");
fs.writeFileSync(
  path.join(WEB_INDEX_DIR, "agent-benchmark.json"),
  JSON.stringify(
    {
      version: benchmarkFile.version,
      description: benchmarkFile.description ?? null,
      challenges: agentBenchmark,
      aiTraceExamples,
    },
    null,
    2,
  ),
  "utf8",
);

const kb = (p: string) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;

console.log(`Indexed ${records.length} conjectures, ${stats.claims} claims.`);
console.log(`  corpus.json  ${kb(path.join(GENERATED_DIR, "corpus.json"))}`);
console.log(`  search.json  ${kb(path.join(WEB_INDEX_DIR, "search.json"))} (shipped to the browser)`);
console.log(`  cross-linked across two or more sources: ${stats.crossLinked}`);
console.log(
  `  agent benchmark: ${stats.agentBenchmarkCount}, AI-assisted: ${stats.withAiClaims}, machine-verified: ${stats.withMachineVerified}`,
);
console.log(`  by status:`, byStatus);
