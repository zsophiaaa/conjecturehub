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
import type { Candidate, ClassifiedMatch } from "./types.js";
import type { Claim, Conjecture } from "../types.js";

/**
 * The sweep, end to end. It never changes a status: it appends claims at the
 * `unverified_claim` tier with a source and a date, and a human decides by
 * merging or closing the pull request.
 */

const SEEN_PATH = path.join(CACHE_DIR, "sweep-seen.json");
const SEEN_LIMIT = 20000;

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

function claimIdFor(conjectureId: string, url: string): string {
  const digest = crypto.createHash("sha256").update(url).digest("hex").slice(0, 8);
  return `${conjectureId}-sweep-${digest}`;
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

export interface SweepReport {
  startedAt: string;
  provider: string;
  sourceSummary: { origin: string; count: number; error?: string }[];
  fetched: number;
  afterWindow: number;
  afterDedupe: number;
  afterPrefilter: number;
  matched: number;
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

export async function runSweep(options: {
  write: boolean;
  budget?: number;
  windowDays?: number;
}): Promise<SweepReport> {
  const startedAt = new Date().toISOString();
  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
  const corpus = readAll();
  const byId = new Map(corpus.map((c) => [c.id, c]));

  // Any URL we have already recorded a claim from is not news.
  const knownUrls = new Set<string>();
  for (const conjecture of corpus) {
    for (const claim of conjecture.claims ?? []) knownUrls.add(claim.source.url);
  }

  const seen = loadSeen();
  const results = await fetchAllSources();

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
  const matches = passed
    .flatMap((candidate) => matcher.match(candidate).slice(0, MAX_MATCHES_PER_CANDIDATE))
    .sort((a, b) => b.matchScore - a.matchScore);

  const provider = resolveProvider();
  const budget = options.budget ?? provider.dailyBudget;

  const { classified, used, skipped } = await classifyMatches(matches, byId, {
    provider,
    budget,
  });

  const proposals: Proposal[] = [];
  const needsTriage: TriageItem[] = [];
  const touched = new Map<string, Conjecture>();

  for (const match of classified) {
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
  saveSeen(seen);

  return {
    startedAt,
    provider: provider.name,
    sourceSummary: results.map((r) => ({
      origin: r.origin,
      count: r.candidates.length,
      error: r.error,
    })),
    fetched: all.length,
    afterWindow: recent.length,
    afterDedupe: fresh.length,
    afterPrefilter: passed.length,
    matched: matches.length,
    classifierCalls: used,
    classifierSkipped: skipped,
    proposals: proposals.sort((a, b) => b.confidence - a.confidence),
    needsTriage: needsTriage.sort((a, b) => b.matchScore - a.matchScore),
  };
}
