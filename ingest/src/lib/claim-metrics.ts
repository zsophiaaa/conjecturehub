import type { Claim, Conjecture } from "../types.js";

/**
 * Counts used by the index and the agent-facing filters. Retracted and disputed
 * claims are excluded: a withdrawn claim is part of the history, not evidence of
 * current activity.
 */

export function activeClaims(record: Conjecture): Claim[] {
  return (record.claims ?? []).filter((c) => c.state === "active");
}

export function aiAssistedClaimCount(record: Conjecture): number {
  return activeClaims(record).filter((c) => c.ai_assistance?.used === "yes").length;
}

export function machineVerifiedClaimCount(record: Conjecture): number {
  return activeClaims(record).filter((c) => c.evidence_tier === "machine_verified").length;
}

export function forumClaimCount(record: Conjecture): number {
  return activeClaims(record).filter(
    (c) => c.source.kind === "forum" || c.source.kind === "reddit",
  ).length;
}
