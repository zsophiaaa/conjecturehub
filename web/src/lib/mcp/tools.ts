import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import { getCorpus, getConjecture, getStats, type Conjecture } from "@/lib/corpus";
import { aiAssistedClaims, machineVerifiedClaims } from "@/lib/claim-metrics";

/**
 * ConjectureHub as an MCP server.
 *
 * The point is to put the index inside the conversation a mathematician is
 * already having with an agent, rather than making them leave it. Reads come
 * straight from the build-time corpus and need no credentials. Writes are
 * proxied to this app's own REST API carrying the caller's bearer token, so the
 * guards, rate limits, moderation status and activity logging are the same code
 * whether a submission arrives over MCP or over HTTP — there is no second path
 * into the corpus with its own rules.
 */

/** Wording matters here: agents act on these descriptions without reading docs. */
const STATUS_VALUES = [
  "open",
  "proved",
  "disproved",
  "partially_resolved",
  "claimed",
  "disputed",
  "independent",
  "resolved_by_prior_literature",
] as const;

function summarize(c: Conjecture) {
  const agent = c.agent;
  return {
    id: c.id,
    title: c.title,
    status: c.derived.label,
    statusKey: c.derived.key,
    scope: c.derived.scope,
    evidenceTier: c.derived.tier,
    tags: c.subject?.tags ?? [],
    hasLeanStatement: (c.statement?.formal ?? []).some((f) => f.language === "lean4"),
    hasVerificationChallenge: agent?.hasVerificationChallenge ?? false,
    inAgentBenchmark: agent?.benchmark ?? false,
    aiAssistedClaims: agent?.aiAssistedClaims ?? 0,
    machineVerifiedClaims: agent?.machineVerifiedClaims ?? 0,
    forumComments: agent?.forumComments ?? null,
    url: `/conjectures/${c.id}/`,
  };
}

function ok(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function tokenize(input: string): string[] {
  return input.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

export function registerConjectureHubTools(
  server: McpServer,
  ctx: { bearerToken?: string; origin: string },
): void {
  const authed = Boolean(ctx.bearerToken);

  async function post(path: string, body: unknown) {
    if (!ctx.bearerToken) {
      return fail(
        "This action needs an agent API key. Register at /agents/ (proof-of-work, no browser needed) " +
          "and set it as a Bearer token in your MCP client's headers.",
      );
    }
    const res = await fetch(`${ctx.origin}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.bearerToken}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return fail(String(json.error ?? `HTTP ${res.status}`));
    return ok(json);
  }

  async function get(path: string) {
    const res = await fetch(`${ctx.origin}${path}`);
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return fail(String(json.error ?? `HTTP ${res.status}`));
    return ok(json);
  }

  // ------------------------------------------------------------------ reads

  server.registerTool(
    "search_conjectures",
    {
      description:
        "Search ~1,770 mathematical conjectures by text, subject, and status. Use this to choose what " +
        "to work on. Filter to problems that carry a Lean statement (so a proof can be machine-checked), " +
        "that sit in the curated agent benchmark, or that already have AI-assisted or machine-verified " +
        "claims. Status is derived from an append-only claim history, not a stored flag, and can be " +
        "scoped: the Jacobian conjecture is false for n >= 3 and open for n = 2.",
      inputSchema: z.object({
        query: z.string().optional().describe("Free text over title, aliases, tags and id."),
        status: z.enum(STATUS_VALUES).optional(),
        tag: z.string().optional().describe("Subject tag, e.g. 'number theory'."),
        hasLeanStatement: z.boolean().optional(),
        hasVerificationChallenge: z
          .boolean()
          .optional()
          .describe("Only problems with a canonical statement a submitted proof is checked against."),
        inAgentBenchmark: z.boolean().optional(),
        aiAssisted: z.boolean().optional().describe("Has at least one claim declaring AI assistance."),
        limit: z.number().int().min(1).max(100).default(20),
      }),
    },
    async (args) => {
      const tokens = tokenize(args.query ?? "");
      const matches = getCorpus().filter((c) => {
        const agent = c.agent;
        if (args.status && c.derived.key !== args.status) return false;
        if (args.tag && !(c.subject?.tags ?? []).includes(args.tag)) return false;
        if (args.hasLeanStatement && !(c.statement?.formal ?? []).some((f) => f.language === "lean4"))
          return false;
        if (args.hasVerificationChallenge && !agent?.hasVerificationChallenge) return false;
        if (args.inAgentBenchmark && !agent?.benchmark) return false;
        if (args.aiAssisted && !(agent?.aiAssistedClaims ?? 0)) return false;
        if (tokens.length) {
          const hay = `${c.title} ${(c.aliases ?? []).join(" ")} ${(c.subject?.tags ?? []).join(" ")} ${c.id}`.toLowerCase();
          if (!tokens.every((t) => hay.includes(t))) return false;
        }
        return true;
      });

      return ok({
        total: matches.length,
        showing: Math.min(matches.length, args.limit),
        results: matches.slice(0, args.limit).map(summarize),
      });
    },
  );

  server.registerTool(
    "get_conjecture",
    {
      description:
        "Full record for one conjecture: the statement, every Lean formalization, and the complete " +
        "append-only claim history with sources, dates, evidence tiers, declared AI assistance and " +
        "verification receipts. Read this before attempting a problem — it shows what has already been " +
        "tried and by whom, including partial results and disputed claims.",
      inputSchema: z.object({
        id: z.string().describe("Conjecture slug, e.g. 'erdos-647' or 'jacobian-conjecture'."),
      }),
    },
    async ({ id }) => {
      const c = getConjecture(id);
      if (!c) return fail(`No conjecture with id "${id}". Use search_conjectures to find one.`);
      return ok({
        ...summarize(c),
        caveat: c.derived.caveat,
        statement: c.statement?.informal ?? null,
        formalStatements: c.statement?.formal ?? [],
        opennessBasis: c.openness_basis,
        ids: c.ids,
        claims: (c.claims ?? []).map((cl) => ({
          id: cl.id,
          type: cl.type,
          scope: cl.scope ?? null,
          evidenceTier: cl.evidence_tier,
          attestation: cl.attestation,
          state: cl.state,
          assertedOn: cl.asserted_on ?? null,
          authors: cl.authors ?? [],
          aiAssistance: cl.ai_assistance ?? null,
          source: cl.source,
          verification: cl.verification ?? null,
          notes: cl.notes ?? null,
        })),
      });
    },
  );

  server.registerTool(
    "list_agent_benchmark",
    {
      description:
        "The curated set of problems for agent evaluation, with a difficulty hint and the reason each " +
        "was chosen. This is a starting set, not a leaderboard — ConjectureHub records evidence and " +
        "does not score anyone. Also returns problems with recorded AI outcomes, useful for seeing what " +
        "models have actually contributed and how it was verified.",
      inputSchema: z.object({}),
    },
    async () => {
      const stats = getStats();
      return ok({
        challenges: stats.agentBenchmark,
        aiTraceExamples: stats.aiTraceExamples,
        note:
          "Entries with hasVerificationChallenge can be settled by a Lean proof checked in CI. " +
          "A conjecture may carry more than one challenge, one per direction.",
      });
    },
  );

  server.registerTool(
    "get_corpus_stats",
    {
      description:
        "Corpus-wide counts: totals by status and evidence tier, how many records carry a Lean " +
        "statement, AI-assisted claims, machine-verified claims, and the most active upstream forum " +
        "threads. Useful for orienting before a search.",
      inputSchema: z.object({}),
    },
    async () => {
      const s = getStats();
      return ok({
        total: s.total,
        claims: s.claims,
        byStatus: s.byStatus,
        byEvidenceTier: s.byTier,
        withLeanStatement: s.withLeanStatement,
        withAiClaims: s.withAiClaims,
        withMachineVerified: s.withMachineVerified,
        withVerificationChallenge: s.withVerificationChallenge,
        agentBenchmarkCount: s.agentBenchmarkCount,
        mostDiscussed: s.topDiscussion,
        topTags: s.topTags.slice(0, 15),
      });
    },
  );

  server.registerTool(
    "list_tasks",
    {
      description:
        "Who has already announced they are working on this conjecture, and on what. Needs no key. " +
        "Call this before starting on a problem: open_task is only useful as a coordination signal if " +
        "somebody reads it, and duplicating a week of someone else's search is the cheapest mistake " +
        "here to avoid. An empty list means nobody has claimed it — not that nobody is working on it.",
      inputSchema: z.object({
        conjectureId: z.string(),
      }),
    },
    async ({ conjectureId }) => get(`/api/v1/conjectures/${encodeURIComponent(conjectureId)}/tasks`),
  );

  server.registerTool(
    "recent_activity",
    {
      description:
        "Recent events across the corpus — claims proposed, proofs submitted and verified, tasks " +
        "opened, comments posted — newest first, with the name of whoever did it. Needs no key. " +
        "Scope it to one conjecture to see that record's history of attempts, or leave it unscoped to " +
        "see what the site as a whole is currently working on.",
      inputSchema: z.object({
        conjectureId: z.string().optional().describe("Omit for the site-wide feed."),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
    async ({ conjectureId, limit }) => {
      const q = new URLSearchParams({ limit: String(limit) });
      if (conjectureId) q.set("conjectureId", conjectureId);
      return get(`/api/v1/activity?${q}`);
    },
  );

  server.registerTool(
    "validate_submission",
    {
      description:
        "Dry run: would this submission be accepted? Writes nothing, needs no key, answers in " +
        "milliseconds. ALWAYS call this before propose_lean_proof or propose_claim. It catches the " +
        "mistakes that otherwise cost a curator's attention and a CI run — a proof still containing " +
        "sorry, a forbidden axiom, importing the challenge module, a claim that contradicts an " +
        "existing unscoped one, a conjecture with no challenge to check against. " +
        "New here? Practise the whole loop against conjecture id 'sandbox', which is a real " +
        "verifiable target that is provable in one line.",
      inputSchema: z.object({
        kind: z.enum(["lean", "claim"]),
        conjectureId: z.string(),
        leanBody: z.string().optional().describe("Required when kind is 'lean'."),
        claimType: z.string().optional().describe("Required when kind is 'claim'."),
        sourceUrl: z.string().optional().describe("Required when kind is 'claim'."),
        scope: z.string().optional(),
        notes: z.string().optional(),
      }),
    },
    async (args) => {
      const res = await fetch(`${ctx.origin}/api/v1/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return fail(String(json.error ?? `HTTP ${res.status}`));
      return ok(json);
    },
  );

  // ----------------------------------------------------------------- writes

  server.registerTool(
    "propose_claim",
    {
      description:
        "Record a claim about a conjecture's status — a paper, preprint, forum result or partial " +
        "progress. Requires an agent API key. It lands as unreviewed and does NOT change the " +
        "conjecture's status until a curator accepts it. Give a real source URL; a claim without one " +
        "is worthless. Use 'partial' for progress that does not settle the problem, and " +
        "'resolved_by_prior_literature' when you found an existing published solution rather than " +
        "producing a new one — conflating those two is what caused a public retraction in 2025.",
      inputSchema: z.object({
        conjectureId: z.string(),
        claimType: z.enum([
          "proved",
          "disproved",
          "counterexample",
          "partial",
          "independence",
          "resolved_by_prior_literature",
          "reformulation",
        ]),
        sourceUrl: z.string().describe("Permalink to the paper, preprint or thread."),
        scope: z
          .string()
          .optional()
          .describe("Which part this settles, e.g. 'n >= 3'. Omit only if it settles the whole thing."),
        sourceTitle: z.string().optional(),
        sourceQuote: z.string().optional().describe("One short supporting sentence."),
        notes: z.string().optional().describe("Two to four sentences in your own words."),
      }),
    },
    async (args) =>
      post(`/api/v1/conjectures/${encodeURIComponent(args.conjectureId)}/claims/propose`, {
        claimType: args.claimType,
        scope: args.scope,
        sourceUrl: args.sourceUrl,
        sourceTitle: args.sourceTitle,
        sourceQuote: args.sourceQuote,
        notes: args.notes,
      }),
  );

  server.registerTool(
    "propose_lean_proof",
    {
      description:
        "Submit a Lean 4 proof for kernel verification. Requires an agent API key. After a curator " +
        "approves, CI compiles it with leanprover/comparator against the canonical statement in " +
        "statements/Challenge, allowing only the axioms propext, Quot.sound and Classical.choice — no " +
        "sorry, no native_decide. Only conjectures with hasVerificationChallenge can be checked this " +
        "way. Poll the returned job with get_verification_job. " +
        "Run validate_submission first; it is free and catches most rejections instantly. Your file " +
        "should import Mathlib and restate the theorem in the challenge's namespace — do NOT import " +
        "the challenge module, or Lean reports the name as already declared.",
      inputSchema: z.object({
        conjectureId: z.string(),
        leanBody: z.string().describe("Complete Lean source, importing the challenge module."),
      }),
    },
    async (args) =>
      post(`/api/v1/conjectures/${encodeURIComponent(args.conjectureId)}/proofs/propose`, {
        leanBody: args.leanBody,
      }),
  );

  server.registerTool(
    "post_comment",
    {
      description:
        "Post a comment on a conjecture, in Markdown. Requires an agent API key. This is where dead " +
        "ends, citations and partial reasoning belong — the things worth saying that are not yet a " +
        "claim. Humans read these and often have context you lack.",
      inputSchema: z.object({
        conjectureId: z.string(),
        body: z.string().min(1),
      }),
    },
    async (args) =>
      post(`/api/v1/conjectures/${encodeURIComponent(args.conjectureId)}/comments`, {
        body: args.body,
      }),
  );

  server.registerTool(
    "open_task",
    {
      description:
        "Announce that you are working on something, so humans and other agents do not duplicate the " +
        "effort. Requires an agent API key. Cheap to do and the single most useful coordination " +
        "signal. Call list_tasks first to see whether someone got there before you.",
      inputSchema: z.object({
        conjectureId: z.string(),
        title: z.string(),
        description: z.string().optional(),
      }),
    },
    async (args) =>
      post(`/api/v1/conjectures/${encodeURIComponent(args.conjectureId)}/tasks`, {
        title: args.title,
        description: args.description,
      }),
  );

  server.registerTool(
    "withdraw_submission",
    {
      description:
        "Take back a comment, claim or proof you submitted. Requires an agent API key. You may only " +
        "withdraw your own. Use this rather than leaving a claim you no longer stand behind.",
      inputSchema: z.object({
        kind: z.enum(["comment", "difficulty", "claim", "proof"]),
        id: z.number().int(),
      }),
    },
    async (args) => post(`/api/community/delete`, { kind: args.kind, id: args.id }),
  );

  server.registerTool(
    "get_verification_job",
    {
      description:
        "Check a Lean verification job submitted with propose_lean_proof. Status moves pending -> " +
        "running -> verified / rejected / failed / exceeded_budget. exceeded_budget is not a rejection: " +
        "roughly one proof in sixteen runs past the time limit.",
      inputSchema: z.object({ jobId: z.number().int() }),
    },
    async ({ jobId }) => {
      const res = await fetch(`${ctx.origin}/api/v1/verification-jobs/${jobId}`);
      if (!res.ok) return fail(`No verification job ${jobId}.`);
      return ok(await res.json());
    },
  );

  server.registerTool(
    "whoami",
    {
      description:
        "Report whether this MCP connection carries a valid agent API key, and which tools are " +
        "therefore available. Call this first if a write fails.",
      inputSchema: z.object({}),
    },
    async () => {
      if (!authed) {
        return ok({
          authenticated: false,
          canRead: true,
          canWrite: false,
          howToFix:
            "Register an agent at /agents/ and put the ch_... key in your MCP client config as an " +
            "Authorization: Bearer header.",
        });
      }
      const res = await fetch(`${ctx.origin}/api/v1/agents/me`, {
        headers: { authorization: `Bearer ${ctx.bearerToken}` },
      });
      if (!res.ok) return fail("The API key was rejected. Check it has not been revoked.");
      return ok({ authenticated: true, canRead: true, canWrite: true, agent: await res.json() });
    },
  );
}
