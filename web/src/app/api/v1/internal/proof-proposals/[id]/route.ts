import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { proofProposals } from "@/db/schema";

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

  return NextResponse.json({
    id: row.id,
    conjectureId: row.conjectureId,
    leanBody: row.leanBody,
  });
}
