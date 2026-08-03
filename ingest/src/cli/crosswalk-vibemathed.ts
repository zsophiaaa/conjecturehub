import { readAll, write } from "../lib/conjecture.js";
import { today } from "../lib/http.js";
import { validateConjecture } from "../lib/validate.js";
import * as vibemathed from "../sources/vibemathed.js";
import type { Conjecture } from "../types.js";

/**
 * Links records to their VibeMathed entry.
 *
 * Only the link. See the note in sources/vibemathed.ts for why nothing else
 * crosses over.
 *
 * Matching has to be conservative, because a wrong link is worse than a missing
 * one: it sends a reader to a page about a different problem and implies the
 * two projects agree about something. So an entry is matched on its Erdős
 * number, or on its full title after normalisation, and nothing looser. Fuzzy
 * matching would catch more and would quietly attach "Erdős Problem #146" to
 * whichever other Erdős problem shared the most words.
 *
 *   --dry-run   list the matches and write nothing
 */

const dryRun = process.argv.includes("--dry-run");

const { entries, generated } = await vibemathed.loadAll();
console.log(`${vibemathed.NAME} dataset: ${entries.length} entries, generated ${generated ?? "?"}.`);

const records = readAll();

const byErdos = new Map<string, Conjecture>();
const byTitle = new Map<string, Conjecture[]>();
for (const record of records) {
  if (record.ids?.erdos) byErdos.set(String(record.ids.erdos), record);
  for (const title of [record.title, ...(record.aliases ?? [])]) {
    const key = vibemathed.normalizeTitle(title);
    if (key) byTitle.set(key, [...(byTitle.get(key) ?? []), record]);
  }
}

const retrieved = today();
let added = 0;
let already = 0;
let unmatched = 0;
let ambiguous = 0;
let invalid = 0;
const viaErdos: string[] = [];
const viaTitle: string[] = [];

/**
 * Matching is resolved for every entry before anything is written, because the
 * label depends on the result. Their dataset carries near-duplicate entries for
 * the same problem -- `erdos-1061` and `erdos-1061-sum-of-divisors` are both
 * "disproved on 2026-06-24" -- and deciding which is canonical is their call,
 * not ours, so we keep both links and name them apart instead.
 */
const matched = new Map<Conjecture, { entry: vibemathed.Entry; how: string }[]>();

for (const entry of entries) {
  const numbered = vibemathed.erdosNumbers(entry).flatMap((n) => {
    const hit = byErdos.get(n);
    return hit ? [hit] : [];
  });

  // One entry can cover two numbered problems, and both of ours should point
  // at it.
  const targets: { record: Conjecture; how: string }[] = numbered.map((record) => ({
    record,
    how: "erdos",
  }));

  if (targets.length === 0) {
    // shortName is checked too: their "WOWII 144" style abbreviations never
    // match ours, but where a full name differs only by an expansion the alias
    // list often carries the other form.
    const candidates = [entry.name, entry.shortName].filter(Boolean) as string[];
    const hits = new Set<Conjecture>();
    for (const candidate of candidates) {
      for (const hit of byTitle.get(vibemathed.normalizeTitle(candidate)) ?? []) hits.add(hit);
    }
    if (hits.size > 1) {
      ambiguous += 1;
      continue;
    }
    if (hits.size === 1) {
      targets.push({ record: [...hits][0]!, how: "title" });
    }
  }

  if (targets.length === 0) {
    unmatched += 1;
    continue;
  }

  for (const { record, how } of targets) {
    matched.set(record, [...(matched.get(record) ?? []), { entry, how }]);
  }
}

let doubled = 0;

for (const [record, hits] of matched) {
  if (hits.length > 1) doubled += 1;
  for (const { entry, how } of hits) {
    const url = vibemathed.permalink(entry.slug);
    record.ids ??= {};
    record.ids.external ??= [];
    if (record.ids.external.some((e) => e.url === url)) {
      already += 1;
      continue;
    }

    const label = hits.length === 1 ? vibemathed.NAME : `${vibemathed.NAME} (${entry.slug})`;
    record.ids.external.push({ label, url });

    const existing = record.provenance.find((p) => p.source === "vibemathed");
    if (existing) {
      existing.retrieved = retrieved;
      existing.upstream_version = generated;
    } else {
      record.provenance.push({
        fields: ["ids.external"],
        source: "vibemathed",
        url: vibemathed.DATASET,
        license: vibemathed.LICENSE,
        retrieved,
        upstream_version: generated,
      });
    }

    const issues = validateConjecture(record);
    if (issues.length > 0) {
      invalid += 1;
      console.error(`  ${record.id}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
      continue;
    }

    if (!dryRun) write(record);
    added += 1;
    (how === "erdos" ? viaErdos : viaTitle).push(`${record.id}  <-  ${entry.slug}`);
  }
}

if (viaTitle.length > 0) {
  // Printed in full because a title match is the one that can be wrong in a way
  // no counter would show.
  console.log("\nMatched on title:");
  for (const line of viaTitle) console.log(`  ${line}`);
}

console.log(`\n${dryRun ? "Would add" : "Added"} ${added} link(s) across ${matched.size} record(s): ${viaErdos.length} matched by Erdős number, ${viaTitle.length} by title.`);
console.log(`  ${already} already linked, ${unmatched} entries with no counterpart here, ${ambiguous} ambiguous.`);
if (doubled > 0) {
  console.log(`  ${doubled} record(s) match more than one entry upstream; both links kept, named by slug.`);
}
if (invalid > 0) console.log(`  ${invalid} skipped because the result would not validate.`);
