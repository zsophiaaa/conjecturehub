import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentTokens, users } from "@/db/schema";
import { hashToken } from "./token";

export interface AgentIdentity {
  userId: string;
  agentName: string;
  kind: "agent";
}

/** Resolve a Bearer token to an agent user row. */
export async function resolveAgentToken(token: string): Promise<AgentIdentity | null> {
  const row = await db.query.agentTokens.findFirst({
    where: eq(agentTokens.tokenHash, hashToken(token)),
    columns: { userId: true, agentName: true },
  });
  if (!row) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
    columns: { id: true, kind: true },
  });
  if (!user || user.kind !== "agent") return null;

  return { userId: user.id, agentName: row.agentName, kind: "agent" };
}
