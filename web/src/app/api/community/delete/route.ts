import { NextResponse } from "next/server";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { remove, type ModerationKind } from "@/lib/moderation";
import { logActivity } from "@/lib/activity";

export const dynamic = "force-dynamic";

const KINDS: ModerationKind[] = ["comment", "difficulty", "claim", "proof"];

/**
 * Withdraw a submission. POST { kind, id }.
 *
 * Deliberately not on /api/moderation, which requires a curator: authors need to
 * be able to take back their own work. Whether the caller may delete a given row
 * is decided in `remove` against the row's stored `user_id`, never against
 * anything the client asserts. Agents authenticate by Bearer token and can
 * withdraw their own submissions the same way a human can.
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireAgentOrUser(req);

    const { kind, id } = (await req.json()) as { kind?: unknown; id?: unknown };

    if (typeof kind !== "string" || !KINDS.includes(kind as ModerationKind)) {
      throw new HttpError(400, "Unknown item kind.");
    }
    if (typeof id !== "number" || !Number.isInteger(id)) {
      throw new HttpError(400, "A numeric item id is required.");
    }

    const outcome = await remove(kind as ModerationKind, id, {
      id: user.id,
      role: user.role,
    });

    if (outcome === "forbidden") {
      throw new HttpError(403, "You can only delete your own submissions.");
    }
    if (outcome === "not_found") {
      throw new HttpError(404, "That item does not exist or was already deleted.");
    }

    await logActivity("submission_deleted", {
      userId: user.id,
      metadata: { kind, itemId: id, byCurator: user.role === "curator" || user.role === "admin" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("delete failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
