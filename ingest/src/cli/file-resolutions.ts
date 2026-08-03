import fs from "node:fs";
import path from "node:path";
import { appendClaim, readAll, write } from "../lib/conjecture.js";
import { today } from "../lib/http.js";
import { REPO_ROOT } from "../lib/paths.js";
import { validateConjecture } from "../lib/validate.js";
import * as wikipedia from "../sources/wikipedia.js";
import type { Claim, Conjecture, EvidenceTier } from "../types.js";

/**
 * Turns entries in the Wikipedia review queue into resolution claims.
 *
 * Split from the command that builds the queue because the two are different
 * kinds of act. Building the queue is a measurement anyone can re-run. Filing a
 * claim puts a named person behind a status, and the schema is explicit that no
 * automation may do that -- so this command refuses to run without a name, and
 * refuses to file anything the caller has not listed by id or waved through
 * with --all.
 *
 * The reviewer is attesting that they checked the entry, not that they refereed
 * the proof. That is what community_accepted means and why the note on every
 * claim it writes says where the status came from.
 *
 *   --reviewer NAME   required; the human taking responsibility
 *   --ids a,b,c       file only these conjecture ids
 *   --all             file every entry in the queue
 *   --tier TIER       default community_accepted
 *   --dry-run         print the claims and write nothing
 */

const QUEUE = path.join(REPO_ROOT, "review", "wikipedia-resolution-queue.json");

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const reviewer = flag("reviewer");
const idsArg = flag("ids");
const all = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");
const tier = (flag("tier") ?? "community_accepted") as EvidenceTier;

if (!reviewer) {
  console.error("--reviewer NAME is required. A resolution claim has to carry the name of the");
  console.error("person who checked it; the schema will reject one that does not.");
  process.exit(2);
}
if (!idsArg && !all) {
  console.error("Pass --ids a,b,c to file specific entries, or --all to file the whole queue.");
  process.exit(2);
}
if (tier === "machine_verified") {
  console.error("machine_verified requires a proof receipt. Use record-verification for that.");
  process.exit(2);
}

interface QueueEntry {
  id: string;
  title: string;
  article: string;
  signal?: "proved" | "disproved" | "open";
  reason: string;
}

if (!fs.existsSync(QUEUE)) {
  console.error(`No queue at ${QUEUE}. Run \`npm run enrich:wikipedia\` first.`);
  process.exit(1);
}

const queueFile = JSON.parse(fs.readFileSync(QUEUE, "utf8")) as {
  generatedAt: string;
  queue: QueueEntry[];
};
const wanted = idsArg ? new Set(idsArg.split(",").map((s) => s.trim())) : null;

const byId = new Map<string, Conjecture>(readAll().map((r) => [r.id, r]));
const recorded = today();

const filed: string[] = [];
const remaining: QueueEntry[] = [];
let skipped = 0;

for (const entry of queueFile.queue) {
  const selected = wanted ? wanted.has(entry.id) : true;
  const resolvable = entry.signal === "proved" || entry.signal === "disproved";
  if (!selected || !resolvable) {
    if (selected && !resolvable) {
      console.log(`  ${entry.id}: no resolution signal to file, leaving in the queue.`);
    }
    remaining.push(entry);
    continue;
  }

  const record = byId.get(entry.id);
  if (!record) {
    console.error(`  ${entry.id}: no such record.`);
    remaining.push(entry);
    continue;
  }

  const claimId = `${entry.id}-wikipedia-status`;
  const claim: Claim = {
    id: claimId,
    type: entry.signal === "proved" ? "proved" : "disproved",
    evidence_tier: tier,
    state: "active",
    // The category carries no date. Inventing one from the article's revision
    // history would date our reading of it, not the mathematics.
    asserted_on: null,
    recorded_on: recorded,
    source: {
      kind: "wikipedia",
      url: entry.article,
      title: entry.title,
    },
    reviewer,
    notes:
      `Status taken from English Wikipedia's categorisation and confirmed by ${reviewer}. ` +
      "No referee report or primary citation has been recorded here yet; replace this claim " +
      "with one citing the paper that settled it when someone has it to hand.",
  };

  if (!appendClaim(record, claim)) {
    skipped += 1;
    continue;
  }

  const existing = record.provenance.find((p) => p.source === "wikipedia");
  if (existing) {
    if (!existing.fields.includes("claims")) existing.fields = [...existing.fields, "claims"];
    existing.retrieved = recorded;
  } else {
    record.provenance.push({
      fields: ["claims"],
      source: "wikipedia",
      url: entry.article,
      license: wikipedia.LICENSE,
      retrieved: recorded,
      upstream_version: null,
    });
  }

  const issues = validateConjecture(record);
  if (issues.length > 0) {
    console.error(`  ${entry.id}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    remaining.push(entry);
    continue;
  }

  if (dryRun) {
    console.log(`  ${entry.id}: would file ${claim.type} at ${tier}`);
  } else {
    write(record);
  }
  filed.push(entry.id);
}

if (!dryRun && filed.length > 0) {
  fs.writeFileSync(
    QUEUE,
    JSON.stringify({ generatedAt: queueFile.generatedAt, queue: remaining }, null, 2),
    "utf8",
  );
}

console.log(
  `${dryRun ? "Would file" : "Filed"} ${filed.length} claim(s) as ${reviewer} at tier ${tier}.`,
);
if (skipped > 0) console.log(`  ${skipped} already had a claim from this source.`);
console.log(`  ${remaining.length} entries left in the queue.`);
