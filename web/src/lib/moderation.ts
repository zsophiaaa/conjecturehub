import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { claimProposals, comments, difficultyTags, proofProposals } from "@/db/schema";
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
      .where(and(eq(claimProposals.id, itemId), eq(claimProposals.status, "pending")))
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
      .where(and(eq(proofProposals.id, itemId), eq(proofProposals.status, "pending")))
      .returning();

    if (!row || decision !== "approved") return Boolean(row);

    const job = await db.query.verificationJobs.findFirst({
      where: (j, { eq }) => eq(j.proofProposalId, row.id),
    });
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
