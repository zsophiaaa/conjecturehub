import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { comments, difficultyTags } from "@/db/schema";
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
  authorImage: string | null;
  createdAt: string;
}

export interface DifficultyAggregate {
  slug: string;
  label: string;
  count: number;
}

/** Approved comments for a conjecture, newest first, rendered to safe HTML. */
export async function getApprovedComments(
  conjectureId: string,
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
        columns: { id: true, name: true, image: true },
      })
    : [];
  const byId = new Map(authors.map((a) => [a.id, a]));

  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      html: await renderCommentMarkdown(r.body),
      author: byId.get(r.userId)?.name ?? "Unknown",
      authorImage: byId.get(r.userId)?.image ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  );
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
