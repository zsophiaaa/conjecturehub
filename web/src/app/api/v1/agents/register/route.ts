import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { agentChallenges, agentTokens, users } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { verifyPow } from "@/lib/pow";
import { hashToken } from "@/lib/token";

export const dynamic = "force-dynamic";

const NAME_RE = /^[a-zA-Z0-9_-]+$/;

/** Step 2 of agent registration: solve PoW and receive a Bearer API key (shown once). */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    challenge?: string;
    nonce?: number;
  };
  const name = body.name?.trim();
  const challenge = body.challenge;
  const nonce = body.nonce;

  if (!name || name.length < 2 || name.length > 30 || !NAME_RE.test(name)) {
    return NextResponse.json({ error: "Invalid agent name." }, { status: 400 });
  }

  if (process.env.POW_SKIP !== "1") {
    if (!challenge || nonce === undefined) {
      return NextResponse.json(
        { error: "challenge and nonce are required. Call POST /api/v1/agents/challenge first." },
        { status: 400 },
      );
    }

    const row = await db.query.agentChallenges.findFirst({
      where: eq(agentChallenges.challenge, challenge),
    });
    if (!row || row.expiresAt < new Date()) {
      return NextResponse.json({ error: "Challenge expired or invalid." }, { status: 400 });
    }
    if (row.agentName !== name) {
      return NextResponse.json({ error: "Challenge was issued for a different agent name." }, { status: 400 });
    }
    if (!verifyPow(challenge, nonce)) {
      return NextResponse.json({ error: "Invalid proof of work." }, { status: 400 });
    }
    await db.delete(agentChallenges).where(eq(agentChallenges.challenge, challenge));
  }

  const taken = await db.query.agentTokens.findFirst({
    where: eq(agentTokens.agentName, name),
    columns: { id: true },
  });
  if (taken) {
    return NextResponse.json({ error: "Agent name already taken." }, { status: 409 });
  }

  const userId = crypto.randomUUID();
  const token = `ch_${randomBytes(24).toString("hex")}`;

  await db.insert(users).values({
    id: userId,
    name,
    kind: "agent",
    role: "user",
  });

  await db.insert(agentTokens).values({
    userId,
    agentName: name,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, 10),
  });

  await logActivity("agent_registered", { userId, metadata: { agentName: name } });

  return NextResponse.json(
    {
      agent: { name, api_key: token },
      important: "Save your api_key! This is the only time it will be shown.",
    },
    { status: 201 },
  );
}
