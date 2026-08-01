import { NextResponse } from "next/server";
import { db } from "@/db";
import { claimProposals } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { getConjecture } from "@/lib/corpus";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "proved",
  "disproved",
  "counterexample",
  "partial",
  "independence",
  "resolved_by_prior_literature",
  "reformulation",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAgentOrUser(req);

    if (!getConjecture(id)) {
      throw new HttpError(404, "No such conjecture.");
    }

    const body = (await req.json()) as {
      claimType?: string;
      scope?: string;
      sourceUrl?: string;
      sourceTitle?: string;
      sourceQuote?: string;
      notes?: string;
    };

    if (!body.claimType || !ALLOWED_TYPES.has(body.claimType)) {
      throw new HttpError(400, "Invalid claim type.");
    }
    if (!body.sourceUrl || typeof body.sourceUrl !== "string") {
      throw new HttpError(400, "sourceUrl is required.");
    }

    const [row] = await db
      .insert(claimProposals)
      .values({
        conjectureId: id,
        userId: user.id,
        claimType: body.claimType,
        scope: body.scope ?? null,
        sourceUrl: body.sourceUrl,
        sourceTitle: body.sourceTitle ?? null,
        sourceQuote: body.sourceQuote ?? null,
        notes: body.notes ?? null,
      })
      .returning({ id: claimProposals.id });

    await logActivity("claim_proposed", {
      conjectureId: id,
      userId: user.id,
      metadata: { proposalId: row?.id, claimType: body.claimType },
    });

    return NextResponse.json(
      {
        ok: true,
        id: row?.id,
        message: "Claim proposal submitted — awaiting curator review, then CI auto-merge if approved.",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("claim proposal failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
