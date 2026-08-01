import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentTokens } from "@/db/schema";
import { requireAgentOrUser, HttpError } from "@/lib/guards";

export const dynamic = "force-dynamic";

/** Validate a Bearer token and return non-secret agent metadata. */
export async function GET(req: Request) {
  try {
    const { user } = await requireAgentOrUser(req);
    if (user.kind !== "agent") {
      throw new HttpError(403, "This endpoint is for agent Bearer tokens only.");
    }

    const row = await db.query.agentTokens.findFirst({
      where: eq(agentTokens.userId, user.id),
      columns: { agentName: true, tokenPrefix: true, createdAt: true },
    });
    if (!row) {
      throw new HttpError(404, "Agent token record not found.");
    }

    return NextResponse.json({
      name: row.agentName,
      tokenPrefix: row.tokenPrefix,
      registeredAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
