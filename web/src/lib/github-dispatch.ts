/**
 * Dispatch GitHub repository events when curators approve proposals.
 * Requires GITHUB_DISPATCH_TOKEN (PAT with contents + actions on this repo).
 */

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
  const repo = process.env.GITHUB_DISPATCH_REPO ?? "conjecturehub/conjecturehub";

  if (!token) {
    console.warn("GITHUB_DISPATCH_TOKEN not set — skipping claim auto-merge dispatch.");
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

export async function dispatchVerifyProof(payload: {
  proposalId: number;
  jobId: number;
  conjectureId: string;
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_DISPATCH_REPO ?? "conjecturehub/conjecturehub";

  if (!token) {
    console.warn("GITHUB_DISPATCH_TOKEN not set — skipping proof verification dispatch.");
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
      event_type: "verify-proof-proposal",
      client_payload: payload,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub dispatch failed (${res.status}): ${text}`);
  }
}
