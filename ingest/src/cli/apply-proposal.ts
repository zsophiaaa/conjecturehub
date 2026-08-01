#!/usr/bin/env tsx
/**
 * Append an approved claim proposal to a conjecture YAML file.
 * Used by .github/workflows/apply-proposal.yml after curator approval.
 *
 * Usage: apply-proposal.ts < proposal.json
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

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

function inferSourceKind(url: string): string {
  if (url.includes("arxiv.org")) return "arxiv";
  if (url.includes("wikipedia.org")) return "wikipedia";
  if (url.includes("news.ycombinator.com")) return "hackernews";
  if (url.includes("mathoverflow")) return "mathoverflow";
  return "manual";
}

async function main() {
  const raw = fs.readFileSync(0, "utf8");
  const payload = JSON.parse(raw) as ProposalPayload;
  const file = path.join(process.cwd(), "conjectures", `${payload.conjectureId}.yaml`);

  if (!fs.existsSync(file)) {
    console.error(`No conjecture file: ${file}`);
    process.exit(1);
  }

  const doc = YAML.parse(fs.readFileSync(file, "utf8")) as {
    claims: Record<string, unknown>[];
  };

  const today = new Date().toISOString().slice(0, 10);
  const claimId = `community-proposal-${payload.proposalId}`;

  const claim = {
    id: claimId,
    type: payload.claimType,
    scope: payload.scope ?? null,
    evidence_tier: "unverified_claim",
    state: "active",
    recorded_on: today,
    asserted_on: today,
    source: {
      kind: inferSourceKind(payload.sourceUrl),
      url: payload.sourceUrl,
      title: payload.sourceTitle ?? null,
      quote: payload.sourceQuote ?? null,
    },
    notes: payload.notes ?? `Approved from ConjectureHub proposal #${payload.proposalId}.`,
  };

  doc.claims = doc.claims ?? [];
  if (doc.claims.some((c) => c.id === claimId)) {
    console.log(`Claim ${claimId} already present — skipping.`);
    return;
  }

  doc.claims.push(claim);
  fs.writeFileSync(file, YAML.stringify(doc, { lineWidth: 0 }));
  console.log(`Appended claim ${claimId} to ${payload.conjectureId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
