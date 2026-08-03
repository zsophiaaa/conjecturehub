import fs from "node:fs";
import path from "node:path";
import { readAll, write } from "../lib/conjecture.js";
import { today } from "../lib/http.js";
import { REPO_ROOT } from "../lib/paths.js";
import { deriveStatus } from "../lib/status.js";
import { validateConjecture } from "../lib/validate.js";
import * as wikipedia from "../sources/wikipedia.js";
import type { Conjecture } from "../types.js";

/**
 * Gives a status to the records that arrived from Wikidata as bare identities.
 *
 * Those records have no claims and no stated basis, and deriveStatus reports
 * anything without claims as open. That is right for a curated entry and wrong
 * here: Catalan and Kepler both came in this way and both were settled decades
 * ago, so the site currently publishes them as open problems.
 *
 * Only the open case is written automatically. Saying "no solution is known to
 * the community, and here is the encyclopedia category that says so" is exactly
 * what openness_basis exists to record. Saying a conjecture is *resolved*
 * requires a claim, and the schema requires a named human on any claim tier
 * strong enough to be believed -- filing those from a script would either put a
 * reviewer's name on work they never did, or publish Catalan's conjecture at
 * the tier the site labels "a rumour with a citation". Those go to a review
 * queue for a human instead.
 *
 *   --dry-run   report what would change and write nothing
 *   --limit N   only look at the first N stubs, for a quick check
 */

const dryRun = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : Infinity;

// Checked in rather than generated: it is a worklist for people, and its value
// is that it shrinks visibly in the history as records get claims.
const QUEUE = path.join(REPO_ROOT, "review", "wikipedia-resolution-queue.json");

function articleTitle(url: string): string | null {
  const match = /\/wiki\/(.+)$/.exec(url);
  return match?.[1] ? decodeURIComponent(match[1]).replace(/_/g, " ") : null;
}

const records = readAll();
const stubs = records
  .filter((r) => r.openness_basis.meaning === "unknown" && (r.claims ?? []).length === 0)
  .filter((r) => r.ids?.wikipedia);

console.log(`${stubs.length} identity-only stub(s) with an English Wikipedia article.`);

const titles = new Map<string, Conjecture>();
for (const record of stubs.slice(0, limit)) {
  const title = articleTitle(record.ids!.wikipedia!);
  if (title) titles.set(title, record);
}

const results = await wikipedia.fetchCategories([...titles.keys()]);
const measured = today();

let opened = 0;
let queued = 0;
let conflicted = 0;
let noSignal = 0;
let missing = 0;
let invalid = 0;
const queue: unknown[] = [];

for (const [title, record] of titles) {
  const result = results.get(title);
  if (!result) {
    missing += 1;
    continue;
  }

  if (result.conflict) {
    conflicted += 1;
    queue.push({
      id: record.id,
      title: record.title,
      article: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
      reason: "conflicting categories",
      categories: result.conflict,
    });
    continue;
  }

  if (result.signal === null) {
    noSignal += 1;
    continue;
  }

  const article = `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`;

  if (result.signal !== "open") {
    queued += 1;
    queue.push({
      id: record.id,
      title: record.title,
      article,
      reason: `Wikipedia categorises this as ${result.signal}`,
      categories: result.categories.filter((c) => c.startsWith("Category:") && !c.includes("stubs")),
      needs: `a ${result.signal} claim with a named reviewer and a citation to the paper that settled it`,
    });
    continue;
  }

  const category = result.categories.find((c) => c.startsWith("Category:Unsolved problems in "))!;
  record.openness_basis = {
    meaning: "no_solution_known_to_community",
    asserted_by: "wikipedia",
    note: `Listed under "${category.replace("Category:", "")}" on English Wikipedia.`,
  };

  const existing = record.provenance.find((p) => p.source === "wikipedia");
  if (existing) {
    if (!existing.fields.includes("openness_basis")) {
      existing.fields = [...existing.fields, "openness_basis"];
    }
    existing.retrieved = measured;
  } else {
    record.provenance.push({
      fields: ["openness_basis"],
      source: "wikipedia",
      url: article,
      license: wikipedia.LICENSE,
      retrieved: measured,
      upstream_version: null,
    });
  }

  const issues = validateConjecture(record);
  if (issues.length > 0) {
    invalid += 1;
    console.error(`  ${record.id}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    continue;
  }

  if (!dryRun) write(record);
  opened += 1;
}

console.log(`${dryRun ? "Would mark" : "Marked"} ${opened} stub(s) open on a stated basis.`);
console.log(`  ${queued} look resolved and need a human to file the claim.`);
console.log(`  ${conflicted} carry contradictory categories.`);
console.log(`  ${noSignal} have no category that says anything about status.`);
if (missing > 0) console.log(`  ${missing} article(s) could not be read.`);
if (invalid > 0) console.log(`  ${invalid} skipped because the result would not validate.`);

/**
 * The same check against records that already have a stated basis and still
 * derive as open. Upstream catalogues can be wrong or stale -- formal-conjectures
 * carries Euler's sum of powers conjecture as "research open" though Lander and
 * Parkin disproved it in 1966 -- and a wrong status inherited with provenance is
 * harder to notice than a missing one. Nothing is rewritten here: the upstream
 * assertion is recorded faithfully, and disagreeing with it is a human's call.
 */
const stated = records
  .filter((r) => !titles.has(articleTitle(r.ids?.wikipedia ?? "") ?? ""))
  .filter((r) => r.ids?.wikipedia && r.openness_basis.meaning !== "unknown")
  .filter((r) => deriveStatus(r).key === "open")
  .slice(0, limit);

const statedTitles = new Map<string, Conjecture>();
for (const record of stated) {
  const title = articleTitle(record.ids!.wikipedia!);
  if (title) statedTitles.set(title, record);
}

const statedResults = await wikipedia.fetchCategories([...statedTitles.keys()]);
let contradicted = 0;

for (const [title, record] of statedTitles) {
  const result = statedResults.get(title);
  if (!result || result.signal === null || result.signal === "open") continue;
  contradicted += 1;
  queue.push({
    id: record.id,
    title: record.title,
    article: `https://en.wikipedia.org/wiki/${encodeURIComponent(result.title.replace(/ /g, "_"))}`,
    reason: `we publish this as open on ${record.openness_basis.asserted_by}'s word, but Wikipedia categorises it as ${result.signal}`,
    categories: result.categories.filter((c) => !c.includes("stubs")),
    needs: "a human to decide which source is stale, then either a claim or a note on the openness basis",
  });
}

console.log(
  `Audited ${statedTitles.size} record(s) we publish as open on an upstream catalogue's word: ${contradicted} contradicted by Wikipedia.`,
);

if (!dryRun) {
  fs.mkdirSync(path.dirname(QUEUE), { recursive: true });
  fs.writeFileSync(QUEUE, JSON.stringify({ generatedAt: measured, queue }, null, 2), "utf8");
  console.log(`Review queue: ${path.relative(process.cwd(), QUEUE)} (${queue.length} entries)`);
}
