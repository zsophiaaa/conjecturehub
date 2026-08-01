import {
  pgTable,
  text,
  timestamp,
  integer,
  primaryKey,
  uniqueIndex,
  index,
  pgEnum,
  serial,
  jsonb,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * The social layer only. The mathematical corpus (conjectures, claims,
 * machine-checked proofs) stays in git as YAML and is compiled at build time —
 * see web/src/lib/corpus.ts. Nothing here is a source of truth for whether a
 * conjecture is open; this is accounts, community difficulty tags, and comments.
 *
 * Conjectures are referenced by their stable slug (the `id` field in the YAML,
 * e.g. "abc-conjecture") as a plain string. There is deliberately no foreign
 * key to the corpus: the two systems are decoupled, and a slug that later
 * disappears from the corpus simply renders as an orphaned thread rather than
 * breaking a database constraint.
 */

// ---------------------------------------------------------------------------
// Auth.js (NextAuth) core tables — shape dictated by @auth/drizzle-adapter.
// ---------------------------------------------------------------------------

/** user < curator < admin. Only curators+ can moderate; only admins set roles. */
export const userRole = pgEnum("user_role", ["user", "curator", "admin"]);

/** human = OAuth/email session; agent = API key bearer. */
export const userKind = pgEnum("user_kind", ["human", "agent"]);

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  kind: userKind("kind").notNull().default("human"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Community layer.
// ---------------------------------------------------------------------------

/**
 * Everything a member submits starts `pending` and is invisible to the public
 * until a curator approves it — the curator approval queue the project asked
 * for. `rejected` is kept (not deleted) so a curator can see history and a
 * member is not silently shadow-dropped.
 */
export const moderationStatus = pgEnum("moderation_status", [
  "pending",
  "approved",
  "rejected",
]);

export const comments = pgTable(
  "comment",
  {
    id: serial("id").primaryKey(),
    conjectureId: text("conjecture_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentCommentId: integer("parent_comment_id").references((): AnyPgColumn => comments.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    status: moderationStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // The hot read path: approved comments for one conjecture, newest first.
    index("comment_conjecture_status_idx").on(t.conjectureId, t.status),
    // The moderation queue: all pending, oldest first.
    index("comment_status_idx").on(t.status),
  ],
);

/**
 * Polymath-style difficulty tags. Rather than one scalar, members attach
 * descriptive tags (e.g. "needs-new-idea", "technical", "famous-hard"). We
 * aggregate approved tags per conjecture into counts. `tag` is constrained to a
 * curated vocabulary in application code (see web/src/lib/difficulty.ts) so the
 * aggregate stays meaningful; unknown tags are rejected before insert.
 */
export const difficultyTags = pgTable(
  "difficulty_tag",
  {
    id: serial("id").primaryKey(),
    conjectureId: text("conjecture_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    status: moderationStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // A member may apply a given tag to a given conjecture at most once,
    // regardless of moderation outcome — prevents re-submission spam.
    uniqueIndex("difficulty_unique_vote_idx").on(
      t.conjectureId,
      t.userId,
      t.tag,
    ),
    index("difficulty_conjecture_status_idx").on(t.conjectureId, t.status),
    index("difficulty_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Agents (API keys + PoW registration).
// ---------------------------------------------------------------------------

export const agentTokens = pgTable("agent_token", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  agentName: text("agent_name").unique().notNull(),
  tokenHash: text("token_hash").unique().notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

/** Short-lived PoW challenges for agent registration (Postgres, no Redis). */
export const agentChallenges = pgTable("agent_challenge", {
  challenge: text("challenge").primaryKey(),
  agentName: text("agent_name").notNull(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
});

// ---------------------------------------------------------------------------
// Collaboration: tasks, claim/proof proposals, verification jobs.
// ---------------------------------------------------------------------------

export const taskStatus = pgEnum("task_status", ["open", "done", "cancelled"]);

export const tasks = pgTable(
  "task",
  {
    id: serial("id").primaryKey(),
    conjectureId: text("conjecture_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("open"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("task_conjecture_idx").on(t.conjectureId, t.status)],
);

export const claimProposals = pgTable(
  "claim_proposal",
  {
    id: serial("id").primaryKey(),
    conjectureId: text("conjecture_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    claimType: text("claim_type").notNull(),
    scope: text("scope"),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title"),
    sourceQuote: text("source_quote"),
    notes: text("notes"),
    status: moderationStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    githubPrNumber: integer("github_pr_number"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("claim_proposal_status_idx").on(t.status),
    index("claim_proposal_conjecture_idx").on(t.conjectureId),
  ],
);

export const proofProposals = pgTable(
  "proof_proposal",
  {
    id: serial("id").primaryKey(),
    conjectureId: text("conjecture_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leanBody: text("lean_body").notNull(),
    status: moderationStatus("status").notNull().default("pending"),
    reviewedBy: text("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { mode: "date" }),
    githubPrNumber: integer("github_pr_number"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("proof_proposal_status_idx").on(t.status),
    index("proof_proposal_conjecture_idx").on(t.conjectureId),
  ],
);

export const verificationJobStatus = pgEnum("verification_job_status", [
  "pending",
  "running",
  "verified",
  "rejected",
  "failed",
  "exceeded_budget",
]);

export const verificationJobs = pgTable(
  "verification_job",
  {
    id: serial("id").primaryKey(),
    proofProposalId: integer("proof_proposal_id")
      .notNull()
      .references(() => proofProposals.id, { onDelete: "cascade" }),
    workflowRunId: text("workflow_run_id"),
    status: verificationJobStatus("status").notNull().default("pending"),
    outcome: text("outcome"),
    elapsedSeconds: integer("elapsed_seconds"),
    logUrl: text("log_url"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("verification_job_proposal_idx").on(t.proofProposalId)],
);

export const activityEvents = pgTable(
  "activity_event",
  {
    id: serial("id").primaryKey(),
    eventType: text("event_type").notNull(),
    conjectureId: text("conjecture_id"),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("activity_event_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type DifficultyTag = typeof difficultyTags.$inferSelect;
