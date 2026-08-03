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
 * kinds of act: building the queue is a measurement anyone can re-run, filing a
 * claim changes what the site says.
 *
 * This used to demand a --reviewer, on the reasoning that a resolution needs a
 * human behind it. That was the wrong shape. What a Wikipedia category supports
 * is not "a person here vouches for this proof" but "an encyclopedia reports
 * this as settled" -- so these file as secondary attestation with no reviewer
 * at all, and the site prints the difference. Demanding a name would only have
 * produced one, which is exactly how 712 claims came to credit
 * "teorth/erdosproblems maintainers" for reviews nobody performed.
 *
 * The standing is still a real judgement about the literature, so nothing is
 * filed that the caller has not listed by id or waved through with --all.
 *
 *   --ids a,b,c       file only these conjecture ids
 *   --all             file every entry in the queue
 *   --tier TIER       standing of the result; default community_accepted
 *   --dry-run         print the claims and write nothing
 */

const QUEUE = path.join(REPO_ROOT, "review", "wikipedia-resolution-queue.json");

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const idsArg = flag("ids");
const all = process.argv.includes("--all");
const dryRun = process.argv.includes("--dry-run");
const tier = (flag("tier") ?? "community_accepted") as EvidenceTier;

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
    attestation: "secondary",
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
    reviewer: null,
    notes:
      `Standing taken from English Wikipedia's categorisation (${entry.reason}). Nobody here has ` +
      "read the paper that settled it, which is what the secondary attestation says; replace " +
      "this claim with one citing that paper when someone has it to hand.",
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
  `${dryRun ? "Would file" : "Filed"} ${filed.length} claim(s) at standing ${tier}, secondary attestation.`,
);
if (skipped > 0) console.log(`  ${skipped} already had a claim from this source.`);
console.log(`  ${remaining.length} entries left in the queue.`);
