import { extractJson, type LlmProvider } from "../llm/provider.js";
import type { Conjecture } from "../types.js";
import type { CandidateMatch, ClassifiedMatch } from "./types.js";

/**
 * Stage 2: decide what a matched candidate actually says about the conjecture.
 *
 * The model's only job is triage. It can propose a claim at the
 * `unverified_claim` tier and nothing above it, it can never set a reviewer,
 * and a human merges every result. Measured LLM judges pass roughly 38% of
 * proofs that experts consider flawed, so treating this output as a verdict
 * would be a category error.
 */

const SYSTEM_PROMPT = `You triage mathematical news for a conjecture status database. You are precise and conservative.

Given a document and one candidate conjecture, decide whether the document asserts something about that conjecture's status.

Return ONLY a JSON object:
{
  "about_this_conjecture": boolean,
  "claim_type": "proved" | "disproved" | "counterexample" | "partial" | "independence" | "resolved_by_prior_literature" | "reformulation" | null,
  "scope": string | null,
  "confidence": number,
  "evidence": string | null,
  "rationale": string
}

Rules that matter:
- "resolved_by_prior_literature" is for a document reporting that a solution ALREADY EXISTED in published work and was found by searching. It is NOT the same as a new proof. Getting this distinction wrong has caused public retractions.
- "scope" records which part of the conjecture is settled, e.g. "dimensions >= 3", "the case n = 2", "assuming GRH". Use null only when the whole conjecture is settled.
- A paper that merely cites, surveys, restates, or makes incremental progress on a conjecture is NOT a resolution. Use "partial" for genuine partial progress and set about_this_conjecture=false for mere mentions.
- "evidence" must be a short verbatim quote from the document. If you cannot quote it, set about_this_conjecture to false.
- "confidence" is your probability from 0 to 1 that a domain expert would agree with your reading.
- Do not speculate about correctness. You are recording what was claimed, not whether it is true.
- Keep "rationale" to a single short sentence, and "evidence" to one quoted sentence. A long answer risks being cut off mid-JSON and discarded.
- "claim_type" must be exactly one of the listed values. "disproof", "solved" and "refuted" are not among them.`;

function buildUserPrompt(match: CandidateMatch, conjecture: Conjecture): string {
  const statement = conjecture.statement?.informal?.slice(0, 700) ?? "(no statement on file)";
  const aliases = (conjecture.aliases ?? []).slice(0, 8).join(", ") || "(none)";

  return [
    `CONJECTURE: ${conjecture.title}`,
    `ALIASES: ${aliases}`,
    `STATEMENT: ${statement}`,
    "",
    `DOCUMENT SOURCE: ${match.candidate.origin} (${match.candidate.kind})`,
    `DOCUMENT TITLE: ${match.candidate.title}`,
    `DOCUMENT TEXT: ${match.candidate.text.slice(0, 3000)}`,
  ].join("\n");
}

interface RawVerdict {
  about_this_conjecture?: boolean;
  claim_type?: string | null;
  scope?: string | null;
  confidence?: number;
  evidence?: string | null;
  rationale?: string;
}

/**
 * Room for the verdict plus a sentence of rationale. The previous 400 was enough
 * for the fields but not the prose, and a reasoning model writing a careful
 * explanation would blow the limit mid-string — leaving unterminated JSON that
 * parsed to nothing and vanished. Observed with gpt-oss-120b on a correct
 * classification of the Jacobian counterexample.
 */
const MAX_VERDICT_TOKENS = 1200;

const VALID_TYPES = new Set([
  "proved",
  "disproved",
  "counterexample",
  "partial",
  "independence",
  "resolved_by_prior_literature",
  "reformulation",
]);

export interface ClassifyOptions {
  provider: LlmProvider;
  budget: number;
  /** Called after each request so the caller can report progress. */
  onProgress?: (used: number, total: number) => void;
}

export async function classifyMatches(
  matches: CandidateMatch[],
  corpus: Map<string, Conjecture>,
  options: ClassifyOptions,
): Promise<{ classified: ClassifiedMatch[]; used: number; skipped: number }> {
  const { provider, budget } = options;
  const classified: ClassifiedMatch[] = [];
  let used = 0;
  let skipped = 0;

  for (const match of matches) {
    const conjecture = corpus.get(match.conjectureId);
    if (!conjecture) continue;

    if (!provider.available || used >= budget) {
      skipped++;
      // Without a classifier the match still surfaces, flagged for a human and
      // carrying no claim type, rather than being silently dropped.
      classified.push({
        ...match,
        claimType: null,
        scope: null,
        confidence: match.matchScore * 0.5,
        evidence: null,
        rationale: provider.available
          ? "LLM budget exhausted for this run; needs human triage."
          : "No LLM provider configured; needs human triage.",
        classifier: "none",
      });
      continue;
    }

    let verdict: RawVerdict | null = null;
    let raw = "";
    try {
      raw = await provider.complete(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(match, conjecture) },
        ],
        { maxTokens: MAX_VERDICT_TOKENS },
      );
      verdict = extractJson<RawVerdict>(raw);
    } catch (error) {
      classified.push({
        ...match,
        claimType: null,
        scope: null,
        confidence: 0,
        evidence: null,
        rationale: `Classifier error: ${(error as Error).message}`,
        classifier: provider.name,
      });
      used++;
      options.onProgress?.(used, budget);
      continue;
    }

    used++;
    options.onProgress?.(used, budget);

    // Unparseable output used to be indistinguishable from "not relevant": both
    // fell through the same `continue`, so a correct verdict cut off mid-JSON by
    // the token limit was thrown away without trace. Surface it for triage
    // instead — a match nobody looked at is recoverable, one silently dropped is
    // not.
    if (!verdict) {
      classified.push({
        ...match,
        claimType: null,
        scope: null,
        confidence: match.matchScore * 0.5,
        evidence: null,
        rationale: `Classifier returned output that is not JSON${
          raw.length > 0 ? ` (${raw.length} chars, possibly truncated)` : ""
        }; needs human triage.`,
        classifier: provider.name,
      });
      continue;
    }

    if (!verdict.about_this_conjecture) continue;

    const claimType =
      verdict.claim_type && VALID_TYPES.has(verdict.claim_type) ? verdict.claim_type : null;

    // A near-miss like "disproof" for "disproved" is the model being careless
    // with the enum, not the document being irrelevant. Flag it rather than
    // discard the match.
    if (!claimType) {
      classified.push({
        ...match,
        claimType: null,
        scope: verdict.scope ?? null,
        confidence: Math.max(0, Math.min(1, verdict.confidence ?? 0.5)),
        evidence: verdict.evidence ?? null,
        rationale: `Classifier judged this relevant but returned claim_type ${JSON.stringify(
          verdict.claim_type,
        )}, which is not a valid type; needs human triage.`,
        classifier: provider.name,
      });
      continue;
    }

    classified.push({
      ...match,
      claimType,
      scope: verdict.scope ?? null,
      confidence: Math.max(0, Math.min(1, verdict.confidence ?? 0.5)),
      evidence: verdict.evidence ?? null,
      rationale: verdict.rationale ?? null,
      classifier: provider.name,
    });
  }

  return { classified, used, skipped };
}
