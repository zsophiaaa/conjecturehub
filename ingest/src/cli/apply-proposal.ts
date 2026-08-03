#!/usr/bin/env tsx
/**
 * Append an approved claim proposal to a conjecture YAML file.
 * Used by .github/workflows/apply-proposal.yml after curator approval.
 *
 * Usage: apply-proposal.ts < proposal.json
 */
import fs from "node:fs";
import { defaultAttestation } from "../lib/attestation.js";
import { appendClaim, exists, read, write } from "../lib/conjecture.js";
import type { Claim, SourceKind } from "../types.js";

interface ProposalPayload {
  proposalId: number;
  conjectureId: string;
  claimType: string;
  scope?: string | null;
  sourceUrl: string;
  sourceTitle?: string | null;
  sourceQuote?: string | null;
  notes?: string | null;
}

function inferSourceKind(url: string): SourceKind {
  if (url.includes("arxiv.org")) return "arxiv";
  if (url.includes("wikipedia.org")) return "wikipedia";
  if (url.includes("news.ycombinator.com")) return "hackernews";
  if (url.includes("mathoverflow")) return "mathoverflow";
  return "manual";
}

async function main() {
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw) as ProposalPayload;

  if (!exists(payload.conjectureId)) {
    console.error(`No conjecture file for ${payload.conjectureId}`);
    process.exit(1);
  }

  const conjecture = read(payload.conjectureId);

  const today = new Date().toISOString().slice(0, 10);
  const claimId = `community-proposal-${payload.proposalId}`;

  const sourceKind = inferSourceKind(payload.sourceUrl);

  const claim: Claim = {
    id: claimId,
    type: payload.claimType as Claim["type"],
    scope: payload.scope ?? null,
    evidence_tier: "unverified_claim",
    attestation: defaultAttestation(sourceKind),
    state: "active",
    recorded_on: today,
    asserted_on: today,
    source: {
      kind: sourceKind,
      url: payload.sourceUrl,
      title: payload.sourceTitle ?? null,
      quote: payload.sourceQuote ?? null,
    },
    notes: payload.notes ?? `Approved from ConjectureHub proposal #${payload.proposalId}.`,
  };

  if (!appendClaim(conjecture, claim)) {
    console.log(`Claim ${claimId} already present — skipping.`);
    return;
  }

  // Through the shared writer, not YAML.stringify: this file is one of several
  // that append a claim, and any of them writing its own way puts the corpus
  // into two formats and buries the next real diff under a reflow.
  write(conjecture);
  console.log(`Appended claim ${claimId} to ${payload.conjectureId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
