import { NextResponse } from "next/server";
import { checkClaimSubmission, checkLeanSubmission } from "@/lib/submission-checks";

export const dynamic = "force-dynamic";

/**
 * Dry run. Says whether a submission would be accepted and writes nothing.
 *
 * No authentication: there is nothing to protect, it touches no state, and
 * requiring a key would defeat the purpose. An agent should be able to check its
 * work before it has registered, and a harness should be able to lint a batch of
 * candidate proofs without creating a single row.
 *
 *   POST { kind: "lean",  conjectureId, leanBody }
 *   POST { kind: "claim", conjectureId, claimType, sourceUrl, scope?, notes? }
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const kind = body.kind;
  const conjectureId = body.conjectureId;

  if (typeof conjectureId !== "string" || !conjectureId) {
    return NextResponse.json({ error: "conjectureId is required." }, { status: 400 });
  }

  if (kind === "lean") {
    if (typeof body.leanBody !== "string") {
      return NextResponse.json({ error: "leanBody is required." }, { status: 400 });
    }
    return NextResponse.json(checkLeanSubmission(conjectureId, body.leanBody));
  }

  if (kind === "claim") {
    if (typeof body.claimType !== "string" || typeof body.sourceUrl !== "string") {
      return NextResponse.json(
        { error: "claimType and sourceUrl are required." },
        { status: 400 },
      );
    }
    return NextResponse.json(
      checkClaimSubmission({
        conjectureId,
        claimType: body.claimType,
        sourceUrl: body.sourceUrl,
        scope: typeof body.scope === "string" ? body.scope : null,
        notes: typeof body.notes === "string" ? body.notes : null,
      }),
    );
  }

  return NextResponse.json({ error: 'kind must be "lean" or "claim".' }, { status: 400 });
}
