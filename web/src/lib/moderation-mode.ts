/** When true, comments and difficulty tags publish immediately (no curator queue). */
export function moderationAutoApprove(): boolean {
  return process.env.MODERATION_AUTO_APPROVE === "1";
}

export function initialModerationStatus(): "pending" | "approved" {
  return moderationAutoApprove() ? "approved" : "pending";
}

/** Claim and proof proposals: visible as unverified in open testing, else pending. */
export function initialClaimProofStatus(): "pending" | "unverified" {
  return moderationAutoApprove() ? "unverified" : "pending";
}

export function moderationStatusMessage(kind: "comment" | "difficulty"): string {
  if (moderationAutoApprove()) {
    return kind === "comment"
      ? "Your comment is live."
      : "Your tag is live.";
  }
  return kind === "comment"
    ? "Thanks — your comment is awaiting curator review."
    : "Thanks — your tag is awaiting curator review.";
}

export function claimProposalStatusMessage(): string {
  if (moderationAutoApprove()) {
    return "Claim proposal submitted — visible as unverified until a curator verifies it and triggers CI merge.";
  }
  return "Claim proposal submitted — awaiting curator review, then CI auto-merge if approved.";
}

export function proofProposalStatusMessage(): string {
  if (moderationAutoApprove()) {
    return "Proof proposal submitted — visible as unverified until a curator verifies it and triggers Lean verification in CI.";
  }
  return "Proof proposal submitted — awaiting curator review, then async Lean verification in CI.";
}
