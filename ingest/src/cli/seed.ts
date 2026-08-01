import fs from "node:fs";
import { buildSeedCorpus } from "../seed.js";
import { write, listIds, conjecturePath } from "../lib/conjecture.js";
import { validateConjecture } from "../lib/validate.js";
import { CONJECTURES_DIR } from "../lib/paths.js";

/**
 * Rebuilds the seed corpus from upstream sources.
 *
 * Records that exist locally but are no longer produced by any source are left
 * alone rather than deleted: once an id is published it is permanent, and a
 * conjecture disappearing from an upstream snapshot is not evidence it stopped
 * existing.
 */

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");

const { records, stats } = await buildSeedCorpus();

console.log("Seed sources");
console.log(`  formal-conjectures  ${stats.formalConjecturesTag}  -> ${stats.fromFormalConjectures} records`);
console.log(`  erdosproblems       ${stats.erdosCommit}  -> ${stats.fromErdos} new, ${stats.erdosJoinedToLean} joined to existing Lean statements`);
console.log(`  wikidata                      -> ${stats.wikidataNew} new, ${stats.wikidataMatched} matched to existing records`);
console.log(`  total                         -> ${stats.total} conjectures`);

let invalid = 0;
for (const record of records) {
  const issues = validateConjecture(record);
  if (issues.length > 0) {
    invalid++;
    if (invalid <= 10) {
      console.error(`\ninvalid: ${record.id}`);
      for (const issue of issues.slice(0, 6)) {
        console.error(`  ${issue.path}: ${issue.message}`);
      }
    }
  }
}

if (invalid > 0) {
  console.error(`\n${invalid} record(s) failed validation. Nothing was written.`);
  process.exit(1);
}

if (dryRun) {
  console.log("\nDry run: no files written.");
  process.exit(0);
}

const before = new Set(listIds());
fs.mkdirSync(CONJECTURES_DIR, { recursive: true });
for (const record of records) write(record);

const added = records.filter((r) => !before.has(r.id)).length;
const orphaned = [...before].filter((id) => !records.some((r) => r.id === id));

console.log(`\nWrote ${records.length} files to ${CONJECTURES_DIR} (${added} new).`);
if (orphaned.length > 0) {
  console.log(`${orphaned.length} existing record(s) not produced by any source this run; left untouched.`);
  for (const id of orphaned.slice(0, 5)) console.log(`  ${conjecturePath(id)}`);
}
