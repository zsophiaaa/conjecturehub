import { NextResponse } from "next/server";
import { requireCurator, HttpError } from "@/lib/guards";
import {
  decide,
  type ModerationDecision,
  type ModerationKind,
} from "@/lib/moderation";

export const dynamic = "force-dynamic";

/**
 * Curator decision endpoint. POST { kind, id, decision } to approve or reject a
 * pending comment or difficulty tag. Guarded by requireCurator — the role is
 * read from the database session, so it cannot be spoofed by the client.
 */
export async function POST(req: Request) {
  try {
    const reviewer = await requireCurator();

    const { kind, id, decision } = (await req.json()) as {
      kind?: unknown;
      id?: unknown;
      decision?: unknown;
    };

    if (
      kind !== "comment" &&
      kind !== "difficulty" &&
      kind !== "claim" &&
      kind !== "proof"
    ) {
      throw new HttpError(400, "Unknown item kind.");
    }
    if (decision !== "approved" && decision !== "rejected") {
      throw new HttpError(400, "Decision must be approved or rejected.");
    }
    if (typeof id !== "number" || !Number.isInteger(id)) {
      throw new HttpError(400, "A numeric item id is required.");
    }

    const changed = await decide(
      kind as ModerationKind,
      id,
      decision as ModerationDecision,
      reviewer.id,
    );

    if (!changed) {
      // Already decided by another curator, or gone.
      throw new HttpError(409, "That item was already handled.");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("moderation decision failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
