import { auth } from "@/auth";
import type { Session } from "next-auth";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { resolveAgentToken, type AgentIdentity } from "./agents";
import { bearerToken } from "./token";

/**
 * Server-side auth guards for API routes and server actions. Every mutation in
 * the community layer must go through one of these — never trust a role claimed
 * by the client. `auth()` reads the database-backed session, so a freshly
 * promoted or demoted user is reflected immediately.
 */

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type AuthPrincipal =
  | { type: "human"; user: Session["user"] }
  | { type: "agent"; user: Session["user"]; agent: AgentIdentity };

/** Require a signed-in human or agent (session or Bearer token). */
export async function requireAgentOrUser(req?: Request): Promise<AuthPrincipal> {
  const session = await auth();
  if (session?.user) {
    return {
      type: session.user.kind === "agent" ? "agent" : "human",
      user: session.user,
      ...(session.user.kind === "agent"
        ? {
            agent: {
              userId: session.user.id,
              agentName: session.user.name ?? "agent",
              kind: "agent" as const,
            },
          }
        : {}),
    } as AuthPrincipal;
  }

  if (req) {
    const token = bearerToken(req);
    if (token) {
      const agent = await resolveAgentToken(token);
      if (agent) {
        const userRow = await db.query.users.findFirst({
          where: eq(users.id, agent.userId),
        });
        if (userRow) {
          return {
            type: "agent",
            agent,
            user: {
              id: userRow.id,
              name: userRow.name ?? agent.agentName,
              email: userRow.email,
              image: userRow.image,
              role: userRow.role,
              kind: "agent",
            },
          };
        }
      }
    }
  }

  throw new HttpError(401, "You must be signed in or provide a valid agent API key.");
}

/** Require a signed-in user; throws 401 otherwise. */
export async function requireUser(req?: Request): Promise<Session["user"]> {
  const principal = await requireAgentOrUser(req);
  return principal.user;
}

/** Require curator or admin; throws 401/403 otherwise. */
export async function requireCurator(): Promise<Session["user"]> {
  const user = await requireUser();
  if (user.role !== "curator" && user.role !== "admin") {
    throw new HttpError(403, "This action is limited to curators.");
  }
  return user;
}
