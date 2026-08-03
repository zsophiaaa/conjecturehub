import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { comments, difficultyTags } from "@/db/schema";
import {
  getApprovedComments,
  getDifficultyAggregate,
  getRecentSubmissions,
  getUnverifiedClaimProposals,
  getUnverifiedProofProposals,
  getVerifiedProofs,
} from "@/lib/community";
import { moderationAutoApprove } from "@/lib/moderation-mode";

/** Practice targets, where every attempt is on show rather than only the wins. */
const SANDBOX_IDS = new Set(["sandbox"]);

export const dynamic = "force-dynamic";

/**
 * Everything the community section of a conjecture page needs, in one request:
 * the approved comments, the approved difficulty-tag aggregate, and — if the
 * caller is signed in — which tags they have already submitted and whether they
 * have a comment awaiting review. The last two let the UI reflect the user's
 * own pending contributions without exposing anyone else's.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();

  const viewerId = session?.user?.id ?? null;
  const canModerate = session?.user?.role === "curator" || session?.user?.role === "admin";

  const isSandbox = SANDBOX_IDS.has(id);

  const [approvedComments, difficulty, unverifiedClaims, unverifiedProofs, checkedProofs] =
    await Promise.all([
      getApprovedComments(id, viewerId),
      getDifficultyAggregate(id),
      getUnverifiedClaimProposals(id, viewerId),
      getUnverifiedProofProposals(id, viewerId),
      isSandbox ? getRecentSubmissions(id, viewerId) : getVerifiedProofs(id, viewerId),
    ]);

  let mine: {
    /** Row ids alongside slugs, so the viewer can take a tag back. */
    tags: { id: number; tag: string }[];
    pendingComments: number;
  } | null = null;

  if (session?.user) {
    const userId = session.user.id;
    const [myTags, myPending] = await Promise.all([
      db.query.difficultyTags.findMany({
        where: and(
          eq(difficultyTags.conjectureId, id),
          eq(difficultyTags.userId, userId),
          // A withdrawn tag should be offerable again, not shown as still cast.
          ne(difficultyTags.status, "deleted"),
        ),
        columns: { id: true, tag: true, status: true },
      }),
      db.query.comments.findMany({
        where: and(
          eq(comments.conjectureId, id),
          eq(comments.userId, userId),
          eq(comments.status, "pending"),
        ),
        columns: { id: true },
      }),
    ]);
    mine = {
      tags: myTags.map((t) => ({ id: t.id, tag: t.tag })),
      pendingComments: myPending.length,
    };
  }

  return NextResponse.json({
    comments: approvedComments,
    difficulty,
    unverifiedClaims,
    unverifiedProofs,
    checkedProofs,
    // The sandbox lists every recent attempt; everywhere else these are proofs
    // the kernel accepted, so the UI has to label them differently.
    checkedProofsAreSandbox: isSandbox,
    mine,
    signedIn: Boolean(session?.user),
    canModerate,
    moderationAutoApprove: moderationAutoApprove(),
  });
}
