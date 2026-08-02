/** When true, comments and difficulty tags publish immediately (no curator queue). */
export function moderationAutoApprove(): boolean {
  return process.env.MODERATION_AUTO_APPROVE === "1";
}

export function initialModerationStatus(): "pending" | "approved" {
  return moderationAutoApprove() ? "approved" : "pending";
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
