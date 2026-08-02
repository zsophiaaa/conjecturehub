import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { claimProposals, comments, difficultyTags, proofProposals } from "@/db/schema";
import { renderCommentMarkdown } from "./markdown";
import { difficultyLabel } from "./difficulty";

/**
 * Read/write helpers for the community layer. Reads return only `approved`
 * content for public consumption; the moderation queue uses its own queries in
 * the /moderate route. Writes always insert as `pending`.
 */

export interface PublicComment {
  id: number;
  html: string;
  author: string;
  authorKind: "human" | "agent";
  authorImage: string | null;
  createdAt: string;
  /** True when the viewer submitted this, so the UI can offer to withdraw it. */
  mine: boolean;
}

export interface DifficultyAggregate {
  slug: string;
  label: string;
  count: number;
}

export interface PublicClaimProposal {
  id: number;
  claimType: string;
  scope: string | null;
  sourceUrl: string;
  sourceTitle: string | null;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
  mine: boolean;
}

export interface PublicProofProposal {
  id: number;
  leanPreview: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
  mine: boolean;
}

/** Approved comments for a conjecture, newest first, rendered to safe HTML. */
export async function getApprovedComments(
  conjectureId: string,
  viewerId?: string | null,
): Promise<PublicComment[]> {
  const rows = await db.query.comments.findMany({
    where: and(
      eq(comments.conjectureId, conjectureId),
      eq(comments.status, "approved"),
    ),
    orderBy: desc(comments.createdAt),
  });

  // Fetch author display info in one pass. Drizzle relations aren't declared to
  // keep the schema file focused, so resolve users with a manual map.
  const userIds = [...new Set(rows.map((r) => r.userId))];
  const authors = userIds.length
    ? await db.query.users.findMany({
        where: (u, { inArray }) => inArray(u.id, userIds),
        columns: { id: true, name: true, image: true, kind: true },
      })
    : [];
  const byId = new Map(authors.map((a) => [a.id, a]));

  return rows.map((r) => {
    const author = byId.get(r.userId);
    return {
      id: r.id,
      html: renderCommentMarkdown(r.body),
      author: author?.name ?? "Unknown",
      authorKind: author?.kind ?? "human",
      authorImage: author?.image ?? null,
      createdAt: r.createdAt.toISOString(),
      mine: Boolean(viewerId) && r.userId === viewerId,
    };
  });
}

/** Approved difficulty-tag counts for a conjecture, most-tagged first. */
export async function getDifficultyAggregate(
  conjectureId: string,
): Promise<DifficultyAggregate[]> {
  const rows = await db
    .select({
      slug: difficultyTags.tag,
      count: sql<number>`count(*)::int`,
    })
    .from(difficultyTags)
    .where(
      and(
        eq(difficultyTags.conjectureId, conjectureId),
        eq(difficultyTags.status, "approved"),
      ),
    )
    .groupBy(difficultyTags.tag);

  return rows
    .map((r) => ({ slug: r.slug, label: difficultyLabel(r.slug), count: r.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function resolveAuthors(
  userIds: string[],
): Promise<Map<string, { name: string | null; kind: "human" | "agent" }>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const rows = await db.query.users.findMany({
    where: (u, { inArray }) => inArray(u.id, unique),
    columns: { id: true, name: true, kind: true },
  });
  return new Map(rows.map((r) => [r.id, { name: r.name, kind: r.kind }]));
}

/** Unverified claim proposals visible during open testing (not merged to corpus yet). */
export async function getUnverifiedClaimProposals(
  conjectureId: string,
  viewerId?: string | null,
): Promise<PublicClaimProposal[]> {
  const rows = await db.query.claimProposals.findMany({
    where: and(
      eq(claimProposals.conjectureId, conjectureId),
      eq(claimProposals.status, "unverified"),
    ),
    orderBy: desc(claimProposals.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      claimType: r.claimType,
      scope: r.scope,
      sourceUrl: r.sourceUrl,
      sourceTitle: r.sourceTitle,
      author: author?.name ?? (author?.kind === "agent" ? "agent" : "Unknown"),
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
      mine: Boolean(viewerId) && r.userId === viewerId,
    };
  });
}

/** Unverified proof proposals visible during open testing (not run in CI yet). */
export async function getUnverifiedProofProposals(
  conjectureId: string,
  viewerId?: string | null,
): Promise<PublicProofProposal[]> {
  const rows = await db.query.proofProposals.findMany({
    where: and(
      eq(proofProposals.conjectureId, conjectureId),
      eq(proofProposals.status, "unverified"),
    ),
    orderBy: desc(proofProposals.createdAt),
  });
  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((r) => {
    const author = authors.get(r.userId);
    return {
      id: r.id,
      leanPreview: r.leanBody.slice(0, 400),
      author: author?.name ?? (author?.kind === "agent" ? "agent" : "Unknown"),
      authorKind: author?.kind ?? "human",
      createdAt: r.createdAt.toISOString(),
      mine: Boolean(viewerId) && r.userId === viewerId,
    };
  });
}

/**
 * A crude but serverless-safe rate limit: count a user's submissions of a given
 * kind in the trailing window. In-memory counters don't survive across lambda
 * instances, so we ask the database instead.
 */
export async function recentSubmissionCount(
  table: "comment" | "difficulty_tag",
  userId: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const target = table === "comment" ? comments : difficultyTags;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(target)
    .where(and(eq(target.userId, userId), gte(target.createdAt, since)));
  return row?.n ?? 0;
}
