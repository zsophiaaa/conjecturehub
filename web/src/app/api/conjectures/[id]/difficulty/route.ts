import { NextResponse } from "next/server";
import { db } from "@/db";
import { difficultyTags } from "@/db/schema";
import { requireUser, HttpError } from "@/lib/guards";
import { recentSubmissionCount } from "@/lib/community";
import { isDifficultyTag } from "@/lib/difficulty";
import { getConjecture } from "@/lib/corpus";
import { initialModerationStatus, moderationStatusMessage } from "@/lib/moderation-mode";

export const dynamic = "force-dynamic";

const RATE_LIMIT = 20;
const RATE_WINDOW_MINUTES = 10;

/**
 * Submit a difficulty tag for a conjecture. Stored as `pending` until a curator
 * approves it. The tag must be in the controlled vocabulary; a user may apply a
 * given tag to a given conjecture only once (enforced by a unique index, which
 * we translate into a friendly 409).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireUser();

    if (!getConjecture(id)) {
      throw new HttpError(404, "No such conjecture.");
    }

    const { tag } = (await req.json()) as { tag?: unknown };
    if (typeof tag !== "string" || !isDifficultyTag(tag)) {
      throw new HttpError(400, "Unknown difficulty tag.");
    }

    const recent = await recentSubmissionCount("difficulty_tag", user.id, RATE_WINDOW_MINUTES);
    if (recent >= RATE_LIMIT) {
      throw new HttpError(429, "You're submitting too quickly. Try again shortly.");
    }

    try {
      await db.insert(difficultyTags).values({
        conjectureId: id,
        userId: user.id,
        tag,
        status: initialModerationStatus(),
      });
    } catch (err) {
      // Unique-violation → the user already applied this tag here.
      if (err && typeof err === "object" && "code" in err && err.code === "23505") {
        throw new HttpError(409, "You've already suggested that tag for this conjecture.");
      }
      throw err;
    }

    return NextResponse.json(
      { ok: true, message: moderationStatusMessage("difficulty") },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("difficulty submission failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
