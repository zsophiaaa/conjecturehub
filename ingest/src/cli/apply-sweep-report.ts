/**
 * Replays the claims a sweep run already wrote, from its report artifact.
 *
 * The classify phase writes claims to the working tree and only afterwards
 * tries to open a pull request. When that last step fails the claims are gone
 * with the runner, and the queue has already been saved as drained, so nothing
 * will rediscover them. The report artifact is the surviving record of what was
 * written, and this puts it back.
 *
 *   gh run download <run-id> --repo <owner>/<repo>
 *   npx tsx ingest/src/cli/apply-sweep-report.ts sweep-report.json
 *
 * Appending is by claim id, so running this twice is harmless.
 */

import fs from "node:fs";
import { read, write, appendClaim, exists } from "../lib/conjecture.js";
import type { Claim } from "../types.js";

interface Proposal {
  conjectureId: string;
  claim: Claim;
  confidence?: number;
  written?: boolean;
}

const path = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!path) {
  console.error("Usage: apply-sweep-report.ts <sweep-report.json> [--dry-run]");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(path, "utf8")) as { proposals?: Proposal[] };
const proposals = (report.proposals ?? []).filter((p) => p.written);

if (proposals.length === 0) {
  console.log("Nothing in this report was written. No claims to replay.");
  process.exit(0);
}

let added = 0;
let already = 0;
let missing = 0;

for (const p of proposals) {
  if (!exists(p.conjectureId)) {
    console.warn(`  ? ${p.conjectureId} is not in the corpus — skipping ${p.claim.id}`);
    missing++;
    continue;
  }

  const conjecture = read(p.conjectureId);
  if (appendClaim(conjecture, p.claim)) {
    if (!dryRun) write(conjecture);
    console.log(`  + ${p.conjectureId} <- ${p.claim.id} (${p.claim.type}, ${p.confidence ?? "?"})`);
    added++;
  } else {
    already++;
  }
}

console.log(
  `\n${dryRun ? "Would add" : "Added"} ${added}, already present ${already}` +
    (missing > 0 ? `, unknown conjecture ${missing}` : ""),
);
