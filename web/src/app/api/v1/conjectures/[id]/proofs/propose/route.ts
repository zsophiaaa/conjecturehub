import { NextResponse } from "next/server";
import { db } from "@/db";
import { proofProposals, verificationJobs } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { getConjecture } from "@/lib/corpus";
import {
  initialClaimProofStatus,
  proofProposalStatusMessage,
} from "@/lib/moderation-mode";

export const dynamic = "force-dynamic";

const MAX_LEAN_BYTES = 512_000;

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

    const status = initialClaimProofStatus();

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
    if (status === "pending") {
      const [job] = await db
        .insert(verificationJobs)
        .values({ proofProposalId: proposal!.id, status: "pending" })
        .returning({ id: verificationJobs.id });
      jobId = job!.id;
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
        message: proofProposalStatusMessage(),
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
