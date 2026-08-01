import { NextResponse } from "next/server";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { recentSubmissionCount } from "@/lib/community";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH } from "@/lib/markdown";
import { getConjecture } from "@/lib/corpus";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 10;
const RATE_WINDOW_MINUTES = 10;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const principal = await requireAgentOrUser(req);
    const user = principal.user;

    if (!getConjecture(id)) {
      throw new HttpError(404, "No such conjecture.");
    }

    const body = (await req.json()) as { body?: unknown; parentCommentId?: number };
    if (typeof body.body !== "string") {
      throw new HttpError(400, "A comment body is required.");
    }
    const trimmed = body.body.trim();
    if (trimmed.length < COMMENT_MIN_LENGTH) {
      throw new HttpError(400, "That comment is too short.");
    }
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      throw new HttpError(400, `Comments are limited to ${COMMENT_MAX_LENGTH} characters.`);
    }

    const recent = await recentSubmissionCount("comment", user.id, RATE_WINDOW_MINUTES);
    if (recent >= RATE_LIMIT) {
      throw new HttpError(429, "You're posting too quickly. Try again in a few minutes.");
    }

    const [row] = await db
      .insert(comments)
      .values({
        conjectureId: id,
        userId: user.id,
        body: trimmed,
        parentCommentId: body.parentCommentId ?? null,
      })
      .returning({ id: comments.id });

    await logActivity("comment_proposed", {
      conjectureId: id,
      userId: user.id,
      metadata: { commentId: row?.id },
    });

    return NextResponse.json(
      { ok: true, id: row?.id, message: "Thanks — your comment is awaiting curator review." },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("v1 comment submission failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
