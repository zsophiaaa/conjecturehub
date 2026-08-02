import { NextResponse } from "next/server";
import { db } from "@/db";
import { proofProposals, verificationJobs } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { getConjecture } from "@/lib/corpus";
import { findIdenticalProofProposal, recentSubmissionCount } from "@/lib/community";
import { dispatchVerifyProof } from "@/lib/github-dispatch";
import {
  initialClaimProofStatus,
  proofProposalStatusMessage,
} from "@/lib/moderation-mode";

export const dynamic = "force-dynamic";

const MAX_LEAN_BYTES = 512_000;

/**
 * Tighter than claims: an approved proof occupies a CI runner for minutes and
 * builds Mathlib. Validate with POST /api/v1/validate instead of iterating here.
 */
const RATE_LIMIT = 5;
const RATE_WINDOW_MINUTES = 10;

/** Practice targets, not conjectures. Kept in step with FIXTURE_IDS in build-index.ts. */
const SANDBOX_IDS = new Set(["sandbox"]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAgentOrUser(req);

    const conjecture = getConjecture(id);
    if (!conjecture) {
      throw new HttpError(404, "No such conjecture.");
    }
    if (!conjecture.statement?.formal?.length) {
      throw new HttpError(400, "This conjecture has no Lean formalization yet.");
    }

    const body = (await req.json()) as { leanBody?: string };
    if (typeof body.leanBody !== "string" || !body.leanBody.trim()) {
      throw new HttpError(400, "leanBody is required.");
    }
    if (Buffer.byteLength(body.leanBody, "utf8") > MAX_LEAN_BYTES) {
      throw new HttpError(400, "Lean file is too large.");
    }

    // A retry after a timeout should not queue the proof twice.
    const existing = await findIdenticalProofProposal(id, user.id, body.leanBody.trim());
    if (existing) {
      return NextResponse.json({
        ok: true,
        proposalId: existing.id,
        status: existing.status,
        duplicate: true,
        message: "You already submitted this exact proof; returning the original proposal.",
      });
    }

    const recent = await recentSubmissionCount("proof_proposal", user.id, RATE_WINDOW_MINUTES);
    if (recent >= RATE_LIMIT) {
      throw new HttpError(
        429,
        `Too many proof proposals (${RATE_LIMIT} per ${RATE_WINDOW_MINUTES} minutes). ` +
          "Use POST /api/v1/validate to check a proof without spending quota.",
      );
    }

    // Practice targets skip the curator. Requiring a human to approve a proof of
    // `2 ∣ n(n+1)` would mean an agent can submit but never learn whether its
    // submission was any good, which is the one thing the sandbox exists to
    // tell it. Nothing it produces enters the mathematical record, and the rate
    // limit above bounds how much CI it can ask for.
    const isSandbox = SANDBOX_IDS.has(id);
    const status = isSandbox ? "approved" : initialClaimProofStatus();

    const [proposal] = await db
      .insert(proofProposals)
      .values({
        conjectureId: id,
        userId: user.id,
        leanBody: body.leanBody.trim(),
        status,
      })
      .returning({ id: proofProposals.id });

    let jobId: number | undefined;
    if (status === "pending" || isSandbox) {
      const [job] = await db
        .insert(verificationJobs)
        .values({ proofProposalId: proposal!.id, status: "pending" })
        .returning({ id: verificationJobs.id });
      jobId = job!.id;
    }

    if (isSandbox && jobId) {
      // Degrades quietly when GITHUB_DISPATCH_TOKEN is unset: the job stays
      // pending rather than the submission failing.
      await dispatchVerifyProof({ proposalId: proposal!.id, jobId, conjectureId: id }).catch(
        (err: unknown) => console.error("sandbox verification dispatch failed", err),
      );
    }

    await logActivity("proof_proposed", {
      conjectureId: id,
      userId: user.id,
      metadata: { proposalId: proposal!.id, jobId, status },
    });

    return NextResponse.json(
      {
        ok: true,
        proposalId: proposal!.id,
        verificationJobId: jobId ?? null,
        status,
        message: isSandbox
          ? "Sandbox submission accepted and sent straight to Lean verification — no curator " +
            "needed. Poll GET /api/v1/verification-jobs/" +
            jobId +
            " for the kernel's verdict."
          : proofProposalStatusMessage(),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("proof proposal failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
