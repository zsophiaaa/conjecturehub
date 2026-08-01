import type { Candidate } from "./types.js";

/**
 * Stage 0: cheap deterministic filtering, in plain code, before anything
 * expensive runs. Free LLM tiers are measured in tens of requests a day, so the
 * precision of this stage decides whether the pipeline works at all.
 */

/**
 * Real resolutions rarely announce themselves as "I solved the X conjecture".
 * They read like "we answer a question of Erdos and Graham" or "we construct a
 * counterexample to a conjecture of Hall".
 */
const RESOLUTION_CUES = [
  "conjecture",
  "counterexample",
  "counter-example",
  "disprove",
  "disproved",
  "disproof",
  "refute",
  "refuted",
  "we prove",
  "we show",
  "we settle",
  "settles",
  "settled",
  "resolve",
  "resolved",
  "resolution of",
  "answer a question",
  "answers a question",
  "answering a question",
  "question of",
  "problem of",
  "open problem",
  "long-standing",
  "longstanding",
  "affirmative answer",
  "negative answer",
  "in the affirmative",
  "in the negative",
  "proof of the",
  "a proof of",
  "now proved",
  "has been proved",
  "has been solved",
  "formalized",
  "formalised",
  "erdos problem",
  "erdős problem",
];

/**
 * Phrases that predict crankery or unrelated usage far better than they predict
 * mathematics. "Proof of the Riemann Hypothesis" as a bare string is a much
 * stronger signal of a crank submission than of a result.
 */
const NEGATIVE_CUES = [
  "cryptocurrency",
  "bitcoin",
  "astrology",
  "numerology",
  "my new theory of everything",
  "sponsored",
  "buy now",
  "discount",
];

export interface PrefilterResult {
  passed: boolean;
  reason: string;
  cues: string[];
}

export function prefilter(candidate: Candidate): PrefilterResult {
  const haystack = `${candidate.title}\n${candidate.text}`.toLowerCase();

  if (haystack.length < 24) {
    return { passed: false, reason: "too short to classify", cues: [] };
  }

  for (const negative of NEGATIVE_CUES) {
    if (haystack.includes(negative)) {
      return { passed: false, reason: `negative cue "${negative}"`, cues: [] };
    }
  }

  const cues = RESOLUTION_CUES.filter((cue) => haystack.includes(cue));

  // Wikipedia edits are already scoped to conjecture articles by the source, so
  // the edit itself is the signal and no lexical cue is required.
  if (candidate.kind === "wikipedia") {
    return { passed: true, reason: "edit to a conjecture article", cues };
  }

  if (cues.length === 0) {
    return { passed: false, reason: "no resolution cue", cues: [] };
  }

  return { passed: true, reason: `matched ${cues.length} cue(s)`, cues };
}
