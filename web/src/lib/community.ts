import { and, desc, eq, gte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  claimProposals,
  comments,
  difficultyTags,
  proofProposals,
  verificationJobs,
} from "@/db/schema";
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

export interface PublicVerifiedProof {
  id: number;
  /** The full source. A proof nobody can read is not evidence of anything. */
  leanBody: string;
  author: string;
  authorKind: "human" | "agent";
  createdAt: string;
  /** Null while a submission is still waiting on CI, which sandbox listings show. */
  status: string | null;
  kernelSeconds: number | null;
  logUrl: string | null;
  /** True when the viewer submitted this, so the UI can offer to withdraw it. */
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

/** How many verified proofs of a real conjecture are worth showing. */
const MAX_VERIFIED_PROOFS = 3;
/** How much of a practice target's recent traffic to show. */
const MAX_SANDBOX_SUBMISSIONS = 5;

/** Tactics worth treating as part of a proof's method rather than punctuation. */
const TACTIC_NAMES = new Set([
  "rcases", "obtain", "induction", "cases", "rintro", "refine", "calc", "simpa",
  "simp", "ring", "ring_nf", "omega", "decide", "linarith", "nlinarith", "aesop",
  "norm_num", "constructor", "apply", "unfold", "rw", "rwa", "field_simp",
  "positivity", "gcongr", "interval_cases",
]);

/**
 * The lemmas and tactics a proof is built from.
 *
 * Deliberately narrow: dotted names, which is what Mathlib lemmas look like,
 * plus the tactics above. An earlier version kept every identifier and was
 * useless — local names and numerals swamped the signal, so two proofs
 * identical but for renaming `k` to `j` scored as unrelated.
 */
function proofFingerprint(leanBody: string): Set<string> {
  const stripped = leanBody
    .replace(/\/-[\s\S]*?-\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/^\s*(import|set_option|open|namespace|end)\b[^\n]*/gm, " ");

  const tokens = new Set<string>();
  for (const token of stripped.match(/[A-Za-z_][A-Za-z0-9_.']*/g) ?? []) {
    const lower = token.toLowerCase();
    if (token.includes(".") && token.length > 3) tokens.add(lower);
    else if (TACTIC_NAMES.has(lower)) tokens.add(lower);
  }
  return tokens;
}

/**
 * Whether one proof is a restatement of another.
 *
 * Honest about its reach: it catches the same proof written twice — reformatted,
 * recommented, variables renamed — which is the duplication that actually fills
 * up a list. It cannot tell whether two genuinely different arguments amount to
 * the same mathematical idea, and does not try. Two proofs that case split the
 * same way but discharge the branches with different lemmas are kept as
 * separate, which seems right: the machinery is the interesting part.
 */
function sameApproach(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return a.size === b.size;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared) >= 0.5;
}

/**
 * Proofs a Lean kernel accepted, newest first, restatements collapsed.
 *
 * Capped because the point is to show that a proof exists and what it looks
 * like, not to archive every attempt. A second proof of the same theorem earns
 * its space by arguing differently; the same proof twice just pushes the
 * comments further down the page.
 */
export async function getVerifiedProofs(
  conjectureId: string,
  viewerId?: string | null,
  limit = MAX_VERIFIED_PROOFS,
): Promise<PublicVerifiedProof[]> {
  const rows = await db
    .select({
      id: proofProposals.id,
      userId: proofProposals.userId,
      leanBody: proofProposals.leanBody,
      createdAt: proofProposals.createdAt,
      elapsedSeconds: verificationJobs.elapsedSeconds,
      logUrl: verificationJobs.logUrl,
    })
    .from(proofProposals)
    .innerJoin(verificationJobs, eq(verificationJobs.proofProposalId, proofProposals.id))
    .where(
      and(
        eq(proofProposals.conjectureId, conjectureId),
        eq(verificationJobs.status, "verified"),
        // Withdrawn submissions are kept for the audit trail, not for display.
        ne(proofProposals.status, "deleted"),
      ),
    )
    .orderBy(desc(proofProposals.createdAt));

  const chosen: { row: (typeof rows)[number]; tokens: Set<string> }[] = [];
  for (const row of rows) {
    if (chosen.length >= limit) break;
    const tokens = proofFingerprint(row.leanBody);
    if (chosen.some((c) => sameApproach(c.tokens, tokens))) continue;
    chosen.push({ row, tokens });
  }

  const authors = await resolveAuthors(chosen.map((c) => c.row.userId));
  return chosen.map(({ row }) => {
    const author = authors.get(row.userId);
    return {
      id: row.id,
      leanBody: row.leanBody,
      author: author?.name ?? (author?.kind === "agent" ? "agent" : "Unknown"),
      authorKind: author?.kind ?? "human",
      createdAt: row.createdAt.toISOString(),
      status: "verified",
      kernelSeconds: row.elapsedSeconds,
      logUrl: row.logUrl,
      mine: Boolean(viewerId) && row.userId === viewerId,
    };
  });
}

/**
 * Recent submissions against a practice target, whatever the kernel made of
 * them.
 *
 * A sandbox is for watching harnesses work, so the failures are the useful
 * part: someone wiring up an agent wants to see what a rejection looks like and
 * that other people's attempts get answered too. Filtering to successes would
 * hide exactly that.
 */
export async function getRecentSubmissions(
  conjectureId: string,
  viewerId?: string | null,
  limit = MAX_SANDBOX_SUBMISSIONS,
): Promise<PublicVerifiedProof[]> {
  const rows = await db
    .select({
      id: proofProposals.id,
      userId: proofProposals.userId,
      leanBody: proofProposals.leanBody,
      createdAt: proofProposals.createdAt,
      status: verificationJobs.status,
      elapsedSeconds: verificationJobs.elapsedSeconds,
      logUrl: verificationJobs.logUrl,
    })
    .from(proofProposals)
    .leftJoin(verificationJobs, eq(verificationJobs.proofProposalId, proofProposals.id))
    .where(
      and(
        eq(proofProposals.conjectureId, conjectureId),
        ne(proofProposals.status, "deleted"),
      ),
    )
    .orderBy(desc(proofProposals.createdAt))
    .limit(limit);

  const authors = await resolveAuthors(rows.map((r) => r.userId));
  return rows.map((row) => {
    const author = authors.get(row.userId);
    return {
      id: row.id,
      leanBody: row.leanBody,
      author: author?.name ?? (author?.kind === "agent" ? "agent" : "Unknown"),
      authorKind: author?.kind ?? "human",
      createdAt: row.createdAt.toISOString(),
      status: row.status ?? null,
      kernelSeconds: row.elapsedSeconds,
      logUrl: row.logUrl,
      mine: Boolean(viewerId) && row.userId === viewerId,
    };
  });
}

/**
 * A crude but serverless-safe rate limit: count a user's submissions of a given
 * kind in the trailing window. In-memory counters don't survive across lambda
 * instances, so we ask the database instead.
 */
export async function recentSubmissionCount(
  table: "comment" | "difficulty_tag" | "claim_proposal" | "proof_proposal",
  userId: string,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const target =
    table === "comment"
      ? comments
      : table === "difficulty_tag"
        ? difficultyTags
        : table === "claim_proposal"
          ? claimProposals
          : proofProposals;
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(target)
    .where(and(eq(target.userId, userId), gte(target.createdAt, since)));
  return row?.n ?? 0;
}

/**
 * An identical proof this user already submitted for this conjecture, if any.
 *
 * A harness that retries on a timeout, or an agent that loses track of what it
 * has sent, would otherwise queue the same proof repeatedly and burn a curator's
 * attention and a CI run on each copy. Returning the original makes a retry
 * idempotent from the caller's point of view.
 */
export async function findIdenticalProofProposal(
  conjectureId: string,
  userId: string,
  leanBody: string,
): Promise<{ id: number; status: string } | null> {
  const row = await db.query.proofProposals.findFirst({
    where: (p, { and: a, eq: e, ne }) =>
      a(
        e(p.conjectureId, conjectureId),
        e(p.userId, userId),
        e(p.leanBody, leanBody),
        ne(p.status, "deleted"),
      ),
    columns: { id: true, status: true },
  });
  return row ?? null;
}
