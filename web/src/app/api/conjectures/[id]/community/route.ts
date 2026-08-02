import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { comments, difficultyTags } from "@/db/schema";
import {
  getApprovedComments,
  getDifficultyAggregate,
} from "@/lib/community";
import { moderationAutoApprove } from "@/lib/moderation-mode";

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

  const [approvedComments, difficulty] = await Promise.all([
    getApprovedComments(id),
    getDifficultyAggregate(id),
  ]);

  let mine: {
    tags: string[];
    pendingComments: number;
  } | null = null;

  if (session?.user) {
    const userId = session.user.id;
    const [myTags, myPending] = await Promise.all([
      db.query.difficultyTags.findMany({
        where: and(
          eq(difficultyTags.conjectureId, id),
          eq(difficultyTags.userId, userId),
        ),
        columns: { tag: true, status: true },
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
      tags: myTags.map((t) => t.tag),
      pendingComments: myPending.length,
    };
  }

  return NextResponse.json({
    comments: approvedComments,
    difficulty,
    mine,
    signedIn: Boolean(session?.user),
    moderationAutoApprove: moderationAutoApprove(),
  });
}
