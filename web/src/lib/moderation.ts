import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { claimProposals, comments, difficultyTags, proofProposals, verificationJobs } from "@/db/schema";
import { dispatchApplyClaimProposal, dispatchVerifyProof } from "./github-dispatch";
import { renderCommentMarkdown } from "./markdown";
import { difficultyLabel } from "./difficulty";

/**
 * Curator-facing reads for the moderation queue. Unlike the public reads in
 * community.ts, these surface `pending` items with the submitting user's
 * identity so a curator can judge them. Guarded by requireCurator at the call
 * sites; nothing here checks auth itself.
 */

export interface PendingComment {
  id: number;
  conjectureId: string;
  bodyHtml: string;
  bodyRaw: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
}

export interface PendingDifficulty {
  id: number;
  conjectureId: string;
  tag: string;
  tagLabel: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
}

export async function getPendingComments(): Promise<PendingComment[]> {
  const rows = await db.query.comments.findMany({
    where: eq(comments.status, "pending"),
    orderBy: asc(comments.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      conjectureId: r.conjectureId,
      bodyHtml: renderCommentMarkdown(r.body),
      bodyRaw: r.body,
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getPendingDifficulty(): Promise<PendingDifficulty[]> {
  const rows = await db.query.difficultyTags.findMany({
    where: eq(difficultyTags.status, "pending"),
    orderBy: asc(difficultyTags.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      conjectureId: r.conjectureId,
      tag: r.tag,
      tagLabel: difficultyLabel(r.tag),
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export interface PendingClaim {
  id: number;
  conjectureId: string;
  claimType: string;
  sourceUrl: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
}

export interface PendingProof {
  id: number;
  conjectureId: string;
  leanPreview: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
}

export async function getPendingClaims(): Promise<PendingClaim[]> {
  const rows = await db.query.claimProposals.findMany({
    where: eq(claimProposals.status, "pending"),
    orderBy: asc(claimProposals.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      conjectureId: r.conjectureId,
      claimType: r.claimType,
      sourceUrl: r.sourceUrl,
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getPendingProofs(): Promise<PendingProof[]> {
  const rows = await db.query.proofProposals.findMany({
    where: eq(proofProposals.status, "pending"),
    orderBy: asc(proofProposals.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      conjectureId: r.conjectureId,
      leanPreview: r.leanBody.slice(0, 400),
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getUnverifiedClaims(): Promise<PendingClaim[]> {
  const rows = await db.query.claimProposals.findMany({
    where: eq(claimProposals.status, "unverified"),
    orderBy: asc(claimProposals.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      conjectureId: r.conjectureId,
      claimType: r.claimType,
      sourceUrl: r.sourceUrl,
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export async function getUnverifiedProofs(): Promise<PendingProof[]> {
  const rows = await db.query.proofProposals.findMany({
    where: eq(proofProposals.status, "unverified"),
    orderBy: asc(proofProposals.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      conjectureId: r.conjectureId,
      leanPreview: r.leanBody.slice(0, 400),
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
    };
  });
}

interface AuthorInfo {
  name: string;
  kind: "human" | "agent";
}

async function resolveAuthors(ids: string[]): Promise<Map<string, AuthorInfo>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.query.users.findMany({
    where: (u, { inArray }) => inArray(u.id, unique),
    columns: { id: true, name: true, kind: true },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      { name: r.name ?? (r.kind === "agent" ? "agent" : "Unknown"), kind: r.kind },
    ]),
  );
}

export type ModerationKind = "comment" | "difficulty" | "claim" | "proof";
export type ModerationDecision = "approved" | "rejected";

const TABLES = {
  comment: comments,
  difficulty: difficultyTags,
  claim: claimProposals,
  proof: proofProposals,
} as const;

export type RemoveOutcome = "deleted" | "not_found" | "forbidden";

/**
 * Withdraw a submission: its author taking it back, or a curator removing it.
 *
 * Soft, for the same reason `rejected` is kept. Every read filters on an exact
 * status, so flipping to `deleted` removes the item from the public page, the
 * moderation queue and the aggregates in one move, without destroying the
 * evidence that it was posted. Curators can delete anything; everyone else only
 * their own, and the check is against the row's `user_id` rather than anything
 * the client sends.
 *
 * Unlike `decide`, this accepts a row in any live status — the point is to be
 * able to take down something already published, which approve/reject cannot do.
 */
export async function remove(
  kind: ModerationKind,
  itemId: number,
  actor: { id: string; role?: string | null },
): Promise<RemoveOutcome> {
  const table = TABLES[kind];
  const isCurator = actor.role === "curator" || actor.role === "admin";

  const [existing] = await db
    .select({ id: table.id, userId: table.userId, status: table.status })
    .from(table)
    .where(eq(table.id, itemId));

  if (!existing || existing.status === "deleted") return "not_found";
  if (!isCurator && existing.userId !== actor.id) return "forbidden";

  const result = await db
    .update(table)
    .set({ status: "deleted", reviewedBy: actor.id, reviewedAt: new Date() })
    .where(and(eq(table.id, itemId), ne(table.status, "deleted")))
    .returning({ id: table.id });

  return result.length > 0 ? "deleted" : "not_found";
}

/** Apply an approve/reject decision, stamping the reviewing curator. */
export async function decide(
  kind: ModerationKind,
  itemId: number,
  decision: ModerationDecision,
  reviewerId: string,
): Promise<boolean> {
  if (kind === "claim") {
    const [row] = await db
      .update(claimProposals)
      .set({
        status: decision,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(claimProposals.id, itemId),
          inArray(claimProposals.status, ["pending", "unverified"]),
        ),
      )
      .returning();

    if (!row || decision !== "approved") return Boolean(row);

    await dispatchApplyClaimProposal({
      proposalId: row.id,
      conjectureId: row.conjectureId,
      claimType: row.claimType,
      scope: row.scope,
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle,
      sourceQuote: row.sourceQuote,
      notes: row.notes,
    });
    return true;
  }

  if (kind === "proof") {
    const [row] = await db
      .update(proofProposals)
      .set({
        status: decision,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
      })
      .where(
        and(
          eq(proofProposals.id, itemId),
          inArray(proofProposals.status, ["pending", "unverified"]),
        ),
      )
      .returning();

    if (!row || decision !== "approved") return Boolean(row);

    let job = await db.query.verificationJobs.findFirst({
      where: (j, { eq }) => eq(j.proofProposalId, row.id),
    });
    if (!job) {
      [job] = await db
        .insert(verificationJobs)
        .values({ proofProposalId: row.id, status: "pending" })
        .returning();
    }
    if (job) {
      await dispatchVerifyProof({
        proposalId: row.id,
        jobId: job.id,
        conjectureId: row.conjectureId,
      });
    }
    return true;
  }

  const table = kind === "comment" ? comments : difficultyTags;
  const result = await db
    .update(table)
    .set({
      status: decision,
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
    })
    .where(and(eq(table.id, itemId), eq(table.status, "pending")))
    .returning({ id: table.id });
  return result.length > 0;
}
