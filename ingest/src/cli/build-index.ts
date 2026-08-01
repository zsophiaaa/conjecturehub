import fs from "node:fs";
import path from "node:path";
import { readAll } from "../lib/conjecture.js";
import { deriveStatus } from "../lib/status.js";
import { REPO_ROOT, WEB_INDEX_DIR } from "../lib/paths.js";
import type { Conjecture } from "../types.js";

/**
 * Compiles the YAML corpus into two build artifacts:
 *
 *   web/.generated/corpus.json   full records plus derived status, read at
 *                                build time to render static pages
 *   web/public/index/search.json compact payload shipped to the browser for
 *                                instant client-side search
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
}

const records = readAll();
if (records.length === 0) {
  console.error("No conjectures found. Run `npm run seed` first.");
  process.exit(1);
}

const withStatus = records.map((record: Conjecture) => ({
  ...record,
  derived: deriveStatus(record),
}));

const search: SearchEntry[] = withStatus.map((r) => ({
  i: r.id,
  t: r.title,
  s: r.derived.key,
  e: r.derived.tier ?? "",
  g: [...new Set([...(r.subject?.tags ?? []), ...(r.subject?.msc ?? []).map((m) => `msc:${m}`)])],
  a: (r.aliases ?? []).join(" "),
  l: (r.statement?.formal ?? []).some((f) => f.language === "lean4") ? 1 : 0,
}));

const byStatus: Record<string, number> = {};
const byTier: Record<string, number> = {};
const byTag: Record<string, number> = {};

for (const r of withStatus) {
  byStatus[r.derived.key] = (byStatus[r.derived.key] ?? 0) + 1;
  if (r.derived.tier) byTier[r.derived.tier] = (byTier[r.derived.tier] ?? 0) + 1;
  for (const tag of r.subject?.tags ?? []) byTag[tag] = (byTag[tag] ?? 0) + 1;
}

const stats = {
  generatedAt: new Date().toISOString(),
  total: records.length,
  claims: records.reduce((n, r) => n + (r.claims?.length ?? 0), 0),
  withLeanStatement: search.filter((s) => s.l === 1).length,
  withWikidata: records.filter((r) => r.ids?.wikidata).length,
  withErdos: records.filter((r) => r.ids?.erdos).length,
  withOeis: records.filter((r) => (r.ids?.oeis ?? []).length > 0).length,
  crossLinked: records.filter((r) => {
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
};

fs.mkdirSync(GENERATED_DIR, { recursive: true });
fs.mkdirSync(WEB_INDEX_DIR, { recursive: true });

fs.writeFileSync(path.join(GENERATED_DIR, "corpus.json"), JSON.stringify(withStatus), "utf8");
fs.writeFileSync(path.join(GENERATED_DIR, "stats.json"), JSON.stringify(stats, null, 2), "utf8");
fs.writeFileSync(path.join(WEB_INDEX_DIR, "search.json"), JSON.stringify(search), "utf8");
fs.writeFileSync(path.join(WEB_INDEX_DIR, "stats.json"), JSON.stringify(stats, null, 2), "utf8");

const kb = (p: string) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;

console.log(`Indexed ${records.length} conjectures, ${stats.claims} claims.`);
console.log(`  corpus.json  ${kb(path.join(GENERATED_DIR, "corpus.json"))}`);
console.log(`  search.json  ${kb(path.join(WEB_INDEX_DIR, "search.json"))} (shipped to the browser)`);
console.log(`  cross-linked across two or more sources: ${stats.crossLinked}`);
console.log(`  by status:`, byStatus);
