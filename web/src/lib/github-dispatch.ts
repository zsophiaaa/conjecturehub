/**
 * Dispatch GitHub repository events when curators approve proposals, and when a
 * sandbox proof is submitted.
 *
 * Requires GITHUB_DISPATCH_TOKEN, a PAT with contents and actions on this repo.
 * Without it nothing is dispatched and the verification job sits at `pending`
 * forever — the submission still succeeds, so the failure is quiet. That is the
 * right trade for a curator approving a claim, and a trap when an agent is
 * waiting on a verdict, so the absence is logged loudly enough to find.
 */

/** The repository CI runs in. Override only if this is deployed from a fork. */
const DEFAULT_REPO = "zsophiaaa/conjecturehub";

export async function dispatchApplyClaimProposal(payload: {
  proposalId: number;
  conjectureId: string;
  claimType: string;
  scope?: string | null;
  sourceUrl: string;
  sourceTitle?: string | null;
  sourceQuote?: string | null;
  notes?: string | null;
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO ?? DEFAULT_REPO;

  if (!token) {
    console.error(
      "GITHUB_DISPATCH_TOKEN is not set: the approved claim was recorded but CI was never " +
        "triggered, so nothing will reach the corpus. See docs/COMMUNITY.md.",
    );
    return;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "apply-claim-proposal",
      client_payload: payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${text}`);
  }
}

/** Returns whether CI was actually triggered, so a caller can tell the submitter. */
export async function dispatchVerifyProof(payload: {
  proposalId: number;
  jobId: number;
  conjectureId: string;
}): Promise<boolean> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO ?? DEFAULT_REPO;

  if (!token) {
    console.error(
      "GITHUB_DISPATCH_TOKEN is not set: the proof was recorded but Lean verification was never " +
        "triggered, so the job will sit at pending. See docs/COMMUNITY.md.",
    );
    return false;
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      event_type: "verify-proof-proposal",
      client_payload: payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${text}`);
  }

  return true;
}
