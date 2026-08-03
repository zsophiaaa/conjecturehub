import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readAll, read, write, appendClaim } from "../lib/conjecture.js";
import { validateConjecture } from "../lib/validate.js";
import { today } from "../lib/http.js";
import { CACHE_DIR } from "../lib/paths.js";
import { resolveProvider } from "../llm/provider.js";
import { fetchAllSources } from "./sources.js";
import { prefilter } from "./prefilter.js";
import { Matcher } from "./match.js";
import { classifyMatches } from "./classify.js";
import type { Candidate, CandidateMatch, ClassifiedMatch } from "./types.js";
import type { Claim, Conjecture } from "../types.js";

/**
 * The sweep. It never changes a status: it appends claims at the
 * `unverified_claim` tier with a source and a date, and a human decides by
 * merging or closing the pull request.
 *
 * It runs in two phases against a queue on disk.
 *
 *   watch     fetch every source, drop what we have seen, keep what looks like
 *             a resolution, match it to conjectures by name, and enqueue.
 *             No model calls, so it is cheap enough to run every hour.
 *
 *   classify  drain the queue through the classifier under a budget, append
 *             claims, and leave whatever the budget did not reach queued for
 *             next time.
 *
 * Splitting them decouples how fast we notice something from how much we are
 * willing to spend reading it. Announcements are found within the hour while
 * model spend stays on its own, slower schedule.
 */

const SEEN_PATH = path.join(CACHE_DIR, "sweep-seen.json");
const QUEUE_PATH = path.join(CACHE_DIR, "sweep-queue.json");
const SEEN_LIMIT = 20000;

/**
 * Queue ceiling. Reached only when the classifier has been unavailable for a
 * long stretch, and dropping the lowest-scoring matches is the right loss:
 * they are the ones least likely to be about the conjecture they matched.
 */
const QUEUE_LIMIT = 2000;

/** Matches per candidate that we are willing to spend a classifier call on. */
const MAX_MATCHES_PER_CANDIDATE = 3;

/** Below this the proposal is reported but not written. */
const WRITE_THRESHOLD = 0.6;

/** Anything older than this is not news, and re-reading it wastes the budget. */
const DEFAULT_WINDOW_DAYS = 14;

function loadSeen(): Set<string> {
  if (!fs.existsSync(SEEN_PATH)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(SEEN_PATH, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const trimmed = [...seen].slice(-SEEN_LIMIT);
  fs.writeFileSync(SEEN_PATH, JSON.stringify(trimmed), "utf8");
}

/** A match waiting for a classifier call. */
export interface QueuedMatch extends CandidateMatch {
  queuedAt: string;
}

export function loadQueue(): QueuedMatch[] {
  if (!fs.existsSync(QUEUE_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(QUEUE_PATH, "utf8")) as QueuedMatch[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveQueue(items: QueuedMatch[]): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const trimmed = [...items]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, QUEUE_LIMIT);
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(trimmed), "utf8");
}

/** One queue slot per conjecture per source URL. */
function queueKey(match: CandidateMatch): string {
  return `${match.conjectureId}\u0000${match.candidate.url}`;
}

function claimIdFor(conjectureId: string, url: string): string {
  const digest = crypto.createHash("sha256").update(url).digest("hex").slice(0, 8);
  return `${conjectureId}-sweep-${digest}`;
}

export interface SourceSummaryEntry {
  id: string;
  origin: string;
  count: number;
  error?: string;
  skipped?: string;
}

export interface Proposal {
  conjectureId: string;
  conjectureTitle: string;
  claim: Claim;
  confidence: number;
  rationale: string | null;
  origin: string;
  classifier: string;
  written: boolean;
}

/** Matched to a conjecture but never classified, so no claim can be proposed. */
export interface TriageItem {
  conjectureId: string;
  conjectureTitle: string;
  matchedOn: string;
  matchScore: number;
  url: string;
  title: string;
  origin: string;
  reason: string;
}

export interface WatchReport {
  startedAt: string;
  sourceSummary: SourceSummaryEntry[];
  fetched: number;
  afterWindow: number;
  afterDedupe: number;
  afterPrefilter: number;
  matched: number;
  /** Matches new to the queue this run. */
  queued: number;
  queueDepth: number;
}

export interface SweepReport {
  startedAt: string;
  provider: string;
  /** Set when the watch phase ran in the same process. */
  watch: WatchReport | null;
  queueDepthBefore: number;
  queueDepthAfter: number;
  classifierCalls: number;
  classifierSkipped: number;
  proposals: Proposal[];
  needsTriage: TriageItem[];
}

function buildClaim(match: ClassifiedMatch): Claim {
  const candidate = match.candidate;
  return {
    id: claimIdFor(match.conjectureId, candidate.url),
    type: match.claimType as Claim["type"],
    scope: match.scope,
    evidence_tier: "unverified_claim",
    state: "active",
    asserted_on: candidate.published,
    recorded_on: today(),
    source: {
      kind: candidate.kind,
      url: candidate.url,
      title: candidate.title.slice(0, 300),
      quote: match.evidence ? match.evidence.slice(0, 400) : null,
    },
    authors: candidate.authors.slice(0, 10),
    reviewer: null,
    notes: [
      `Filed automatically by the ${candidate.origin} sweep.`,
      `Matched on "${match.matchedOn}".`,
      match.rationale ? `Classifier rationale: ${match.rationale}` : null,
      "Unreviewed: this records that a claim was made, not that it is correct.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/**
 * Phase one. Everything here is free: HTTP, string matching and a disk write.
 */
export async function runWatch(options: { windowDays?: number } = {}): Promise<WatchReport> {
  const startedAt = new Date().toISOString();
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const corpus = readAll();

  // Any URL we have already recorded a claim from is not news.
  const knownUrls = new Set<string>();
  for (const conjecture of corpus) {
    for (const claim of conjecture.claims ?? []) knownUrls.add(claim.source.url);
  }

  const seen = loadSeen();
  const results = await fetchAllSources({ env: process.env, windowDays });
  const all: Candidate[] = results.flatMap((r) => r.candidates);

  // Sources overlap: the same story reaches us from several Hacker News queries
  // and from a blog feed as well, so collapse on both key and URL.
  const withinRun = new Map<string, Candidate>();
  for (const candidate of all) {
    if (!withinRun.has(candidate.key)) withinRun.set(candidate.key, candidate);
  }
  const byUrl = new Map<string, Candidate>();
  for (const candidate of withinRun.values()) {
    if (!byUrl.has(candidate.url)) byUrl.set(candidate.url, candidate);
  }

  // Undated items come from feeds that only carry recent entries anyway.
  const recent = [...byUrl.values()].filter((c) => c.published === null || c.published >= cutoff);
  const fresh = recent.filter((c) => !seen.has(c.key) && !knownUrls.has(c.url));

  const passed: Candidate[] = [];
  for (const candidate of fresh) {
    seen.add(candidate.key);
    if (prefilter(candidate).passed) passed.push(candidate);
  }

  const matcher = new Matcher(corpus);
  const matches = passed.flatMap((candidate) =>
    matcher.match(candidate).slice(0, MAX_MATCHES_PER_CANDIDATE),
  );

  const queue = loadQueue();
  const already = new Set(queue.map(queueKey));
  const queuedAt = new Date().toISOString();
  let queued = 0;

  for (const match of matches) {
    if (already.has(queueKey(match))) continue;
    already.add(queueKey(match));
    queue.push({ ...match, queuedAt });
    queued += 1;
  }

  saveQueue(queue);
  saveSeen(seen);

  return {
    startedAt,
    sourceSummary: results.map((r) => ({
      id: r.id,
      origin: r.origin,
      count: r.candidates.length,
      error: r.error,
      skipped: r.skipped,
    })),
    fetched: all.length,
    afterWindow: recent.length,
    afterDedupe: fresh.length,
    afterPrefilter: passed.length,
    matched: matches.length,
    queued,
    queueDepth: Math.min(queue.length, QUEUE_LIMIT),
  };
}

/**
 * Phase two. Drains the front of the queue under a budget and writes claims.
 *
 * The batch is sliced to the budget before classifying rather than handing the
 * whole queue over, so exactly which entries were consumed is known: anything
 * outside the slice is untouched, and anything inside it that came back
 * unclassified because no provider was configured goes back on the queue.
 */
export async function runClassify(options: {
  write: boolean;
  budget?: number;
  windowDays?: number;
}): Promise<SweepReport> {
  const startedAt = new Date().toISOString();
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const corpus = readAll();
  const byId = new Map(corpus.map((c) => [c.id, c]));

  const provider = resolveProvider();
  const budget = options.budget ?? provider.dailyBudget;

  const staleBefore = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const queue = loadQueue()
    .filter((item) => item.queuedAt >= staleBefore)
    .sort((a, b) => b.matchScore - a.matchScore);
  const queueDepthBefore = queue.length;

  const batch = queue.slice(0, Math.max(budget, 0));
  const remainder = queue.slice(Math.max(budget, 0));

  const { classified, used, skipped } = await classifyMatches(batch, byId, { provider, budget });

  const proposals: Proposal[] = [];
  const needsTriage: TriageItem[] = [];
  const touched = new Map<string, Conjecture>();
  const unspent: QueuedMatch[] = [];
  const batchByKey = new Map(batch.map((item) => [queueKey(item), item]));

  for (const match of classified) {
    // `none` means the classifier never looked at it, so it has not been spent
    // and belongs back on the queue rather than in the reviewer's PR body.
    if (match.classifier === "none") {
      const original = batchByKey.get(queueKey(match));
      if (original) unspent.push(original);
    }

    if (!match.claimType) {
      needsTriage.push({
        conjectureId: match.conjectureId,
        conjectureTitle: match.conjectureTitle,
        matchedOn: match.matchedOn,
        matchScore: match.matchScore,
        url: match.candidate.url,
        title: match.candidate.title,
        origin: match.candidate.origin,
        reason: match.rationale ?? "unclassified",
      });
      continue;
    }

    const conjecture = touched.get(match.conjectureId) ?? read(match.conjectureId);
    const claim = buildClaim(match);
    const shouldWrite = options.write && match.confidence >= WRITE_THRESHOLD;

    let written = false;
    if (shouldWrite && appendClaim(conjecture, claim)) {
      const issues = validateConjecture(conjecture);
      if (issues.length === 0) {
        touched.set(match.conjectureId, conjecture);
        written = true;
      } else {
        // Never write a record that would fail CI; report it instead.
        conjecture.claims = conjecture.claims.filter((c) => c.id !== claim.id);
        console.error(
          `refusing to write ${claim.id}: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
        );
      }
    }

    proposals.push({
      conjectureId: match.conjectureId,
      conjectureTitle: match.conjectureTitle,
      claim,
      confidence: match.confidence,
      rationale: match.rationale,
      origin: match.candidate.origin,
      classifier: match.classifier,
      written,
    });
  }

  for (const conjecture of touched.values()) write(conjecture);

  const nextQueue = [...unspent, ...remainder];
  saveQueue(nextQueue);

  return {
    startedAt,
    provider: provider.name,
    watch: null,
    queueDepthBefore,
    queueDepthAfter: Math.min(nextQueue.length, QUEUE_LIMIT),
    classifierCalls: used,
    classifierSkipped: skipped,
    proposals: proposals.sort((a, b) => b.confidence - a.confidence),
    needsTriage: needsTriage.sort((a, b) => b.matchScore - a.matchScore),
  };
}

/** Both phases in one process, for running the whole thing by hand. */
export async function runSweep(options: {
  write: boolean;
  budget?: number;
  windowDays?: number;
}): Promise<SweepReport> {
  const watch = await runWatch({ windowDays: options.windowDays });
  const report = await runClassify(options);
  return { ...report, watch };
}
