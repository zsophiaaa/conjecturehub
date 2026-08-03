import { readAll, write } from "../lib/conjecture.js";
import { today } from "../lib/http.js";
import { validateConjecture } from "../lib/validate.js";
import * as wikidata from "../sources/wikidata.js";
import type { Conjecture } from "../types.js";

/**
 * Refreshes `notability` from Wikidata for every record carrying a QID.
 *
 * Separate from `seed` because the two change on different clocks. Seeding
 * rebuilds the corpus from upstream releases and produces a large diff;
 * notability drifts continuously as articles are translated, and refreshing it
 * should be a small, readable commit that touches nothing else.
 *
 *   --dry-run   report what would change and write nothing
 */

const dryRun = process.argv.includes("--dry-run");

const items = await wikidata.loadAll();
const byQid = new Map(items.map((item) => [item.qid, item]));
console.log(`Wikidata returned ${byQid.size} conjecture items.`);

const records = readAll();
const measured = today();

let changed = 0;
let unchanged = 0;
let noQid = 0;
let notInWikidataQuery = 0;
let invalid = 0;

/** Records the field on the existing Wikidata provenance entry, or adds one. */
function noteProvenance(record: Conjecture, qid: string): void {
  const field = "notability.wikipedia_language_editions";
  const existing = record.provenance.find((p) => p.source === "wikidata");
  if (existing) {
    if (!existing.fields.includes(field)) existing.fields = [...existing.fields, field];
    existing.retrieved = measured;
    return;
  }
  record.provenance.push({
    fields: [field],
    source: "wikidata",
    url: `https://www.wikidata.org/wiki/${qid}`,
    license: wikidata.LICENSE,
    retrieved: measured,
    upstream_version: null,
  });
}

for (const record of records) {
  const qid = record.ids?.wikidata;
  if (!qid) {
    noQid += 1;
    continue;
  }

  const item = byQid.get(qid);
  if (!item) {
    // The QID exists but is not typed as a conjecture, so the query never
    // returned it. Leaving the old figure in place would be worse than having
    // none: it would carry a measured_on date implying we had just checked.
    notInWikidataQuery += 1;
    continue;
  }

  const count = item.wikipediaLanguageEditions;
  if (record.notability?.wikipedia_language_editions === count) {
    unchanged += 1;
    continue;
  }

  record.notability = { wikipedia_language_editions: count, measured_on: measured };
  noteProvenance(record, qid);

  const issues = validateConjecture(record);
  if (issues.length > 0) {
    invalid += 1;
    console.error(`  ${record.id}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    continue;
  }

  if (!dryRun) write(record);
  changed += 1;
}

const top = records
  .filter((r) => (r.notability?.wikipedia_language_editions ?? 0) > 0)
  .sort(
    (a, b) =>
      (b.notability?.wikipedia_language_editions ?? 0) -
      (a.notability?.wikipedia_language_editions ?? 0),
  )
  .slice(0, 10);

console.log(`${dryRun ? "Would update" : "Updated"} ${changed}, unchanged ${unchanged}.`);
console.log(`  ${noQid} record(s) have no Wikidata QID, ${notInWikidataQuery} QID(s) not in the query result.`);
if (invalid > 0) console.log(`  ${invalid} record(s) skipped because the result would not validate.`);
console.log("Most widely documented:");
for (const record of top) {
  console.log(
    `  ${String(record.notability!.wikipedia_language_editions).padStart(3)}  ${record.title}`,
  );
}
