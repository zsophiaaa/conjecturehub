import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { verificationJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Poll Lean verification job status (public). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const jobId = Number(id);
  if (!Number.isFinite(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const job = await db.query.verificationJobs.findFirst({
    where: eq(verificationJobs.id, jobId),
  });
  if (!job) {
    return NextResponse.json({ error: "No such job." }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    proofProposalId: job.proofProposalId,
    status: job.status,
    outcome: job.outcome,
    elapsedSeconds: job.elapsedSeconds,
    logUrl: job.logUrl,
    workflowRunId: job.workflowRunId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  });
}
