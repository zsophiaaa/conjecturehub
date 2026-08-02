import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { proofProposals, verificationJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Bot-only: fetch approved proof proposal Lean source for CI. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const row = await db.query.proofProposals.findFirst({
    where: eq(proofProposals.id, id),
  });
  if (!row || row.status !== "approved") {
    return NextResponse.json({ error: "Not found or not approved." }, { status: 404 });
  }

  // The pull request that verifies this proof is a separate workflow run from
  // the one that opened it, and only knows the proposal from its branch name.
  // Without this it has no job to report the kernel's verdict against, and the
  // submitter polls `pending` forever.
  const job = await db.query.verificationJobs.findFirst({
    where: eq(verificationJobs.proofProposalId, row.id),
    orderBy: desc(verificationJobs.id),
  });

  return NextResponse.json({
    id: row.id,
    conjectureId: row.conjectureId,
    leanBody: row.leanBody,
    verificationJobId: job?.id ?? null,
  });
}
