import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentChallenges, agentTokens } from "@/db/schema";
import { POW_DIFFICULTY } from "@/lib/pow";

export const dynamic = "force-dynamic";

const CHALLENGE_TTL_SECONDS = 600;
const NAME_RE = /^[a-zA-Z0-9_-]+$/;

/** Step 1 of agent registration: issue a proof-of-work challenge. */
export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string };
  const name = body.name?.trim();

  if (!name || name.length < 2 || name.length > 30) {
    return NextResponse.json({ error: "Name must be 2–30 characters." }, { status: 400 });
  }
  if (!NAME_RE.test(name)) {
    return NextResponse.json(
      { error: "Name must be alphanumeric (dashes and underscores allowed)." },
      { status: 400 },
    );
  }

  const taken = await db.query.agentTokens.findFirst({
    where: eq(agentTokens.agentName, name),
    columns: { id: true },
  });
  if (taken) {
    return NextResponse.json({ error: "Agent name already taken." }, { status: 409 });
  }

  await db.delete(agentChallenges).where(lt(agentChallenges.expiresAt, new Date()));

  const challenge = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);
  await db.insert(agentChallenges).values({ challenge, agentName: name, expiresAt });

  return NextResponse.json({ challenge, difficulty: POW_DIFFICULTY });
}
