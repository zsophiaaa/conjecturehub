import { NextResponse } from "next/server";
import { db } from "@/db";
import { comments } from "@/db/schema";
import { requireUser, HttpError } from "@/lib/guards";
import { recentSubmissionCount } from "@/lib/community";
import { COMMENT_MAX_LENGTH, COMMENT_MIN_LENGTH } from "@/lib/comment-limits";
import { getConjecture } from "@/lib/corpus";

export const dynamic = "force-dynamic";

// A signed-in user may post at most this many comments per window.
const RATE_LIMIT = 5;
const RATE_WINDOW_MINUTES = 10;

/**
 * Submit a comment. It is stored as `pending` and is invisible until a curator
 * approves it (the approval queue). The body is kept as raw markdown; it is
 * sanitized at render time, never here.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireUser();

    // Reject comments on conjectures that don't exist in the corpus.
    if (!getConjecture(id)) {
      throw new HttpError(404, "No such conjecture.");
    }

    const { body } = (await req.json()) as { body?: unknown };
    if (typeof body !== "string") {
      throw new HttpError(400, "A comment body is required.");
    }
    const trimmed = body.trim();
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

    await db.insert(comments).values({
      conjectureId: id,
      userId: user.id,
      body: trimmed,
    });

    return NextResponse.json(
      { ok: true, message: "Thanks — your comment is awaiting curator review." },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("comment submission failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
