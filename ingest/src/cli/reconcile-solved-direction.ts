import { listIds, read, write } from "../lib/conjecture.js";

/**
 * One-off repair for records that assert both `proved` and a contradicting
 * resolution for the same conjecture.
 *
 * formal-conjectures' "research solved" category means *resolved*, in either
 * direction, but the imported `-fc-solved` claim has to choose a `type` and was
 * hardcoded to `proved`. Where erdosproblems.com records the opposite, the file
 * ends up with two active, unscoped, contradictory claims at the same evidence
 * tier — and because status derivation breaks ties on array order, the import
 * wins. Erdős 90, the unit distance conjecture, was displaying as "Proved" on a
 * site whose entire premise is not conflating "solved" with "proved".
 *
 * `seed.ts` now reconciles this at ingest. This script fixes the corpus in place
 * so the two agree without a full re-seed.
 *
 *   --dry-run   report what would change and write nothing
 */

const dryRun = process.argv.includes("--dry-run");

let changed = 0;
const examples: string[] = [];

for (const id of listIds()) {
  const record = read(id);
  const imported = record.claims?.find((c) => c.id === `${id}-fc-solved`);
  const upstream = record.claims?.find((c) => c.id === `${id}-erdos-status`);
  if (!imported || !upstream) continue;
  if (imported.type === upstream.type) continue;
  // A literature lookup is a different kind of event, not a direction.
  if (upstream.type === "resolved_by_prior_literature") continue;

  if (examples.length < 10) examples.push(`${id}: ${imported.type} -> ${upstream.type}`);

  imported.type = upstream.type;
  imported.notes =
    "Imported from the upstream `research solved` category, which records that the problem is " +
    "resolved without stating the direction. Direction taken from erdosproblems.com, which " +
    `records it as "${upstream.type}". The statement is formalized; the proof has not been ` +
    "machine-checked by ConjectureHub.";

  changed++;
  if (!dryRun) write(record);
}

console.log(
  dryRun
    ? `Would reconcile ${changed} record(s).`
    : `Reconciled ${changed} record(s).`,
);
for (const line of examples) console.log(`  ${line}`);
if (changed > examples.length) console.log(`  ...and ${changed - examples.length} more`);
