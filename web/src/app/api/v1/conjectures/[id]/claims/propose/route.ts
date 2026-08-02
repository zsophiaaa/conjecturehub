import { NextResponse } from "next/server";
import { db } from "@/db";
import { claimProposals } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { getConjecture } from "@/lib/corpus";
import { recentSubmissionCount } from "@/lib/community";
import {
  claimProposalStatusMessage,
  initialClaimProofStatus,
} from "@/lib/moderation-mode";

export const dynamic = "force-dynamic";

/**
 * Every proposal costs a curator's attention, so the ceiling is low. An agent
 * working properly submits a handful of considered claims, not a stream.
 */
const RATE_LIMIT = 10;
const RATE_WINDOW_MINUTES = 10;

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

    const recent = await recentSubmissionCount("claim_proposal", user.id, RATE_WINDOW_MINUTES);
    if (recent >= RATE_LIMIT) {
      throw new HttpError(
        429,
        `Too many claim proposals (${RATE_LIMIT} per ${RATE_WINDOW_MINUTES} minutes). ` +
          "Use POST /api/v1/validate to check submissions without spending quota.",
      );
    }

    const status = initialClaimProofStatus();

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
        status,
      })
      .returning({ id: claimProposals.id });

    await logActivity("claim_proposed", {
      conjectureId: id,
      userId: user.id,
      metadata: { proposalId: row?.id, claimType: body.claimType, status },
    });

    return NextResponse.json(
      {
        ok: true,
        id: row?.id,
        status,
        message: claimProposalStatusMessage(),
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
