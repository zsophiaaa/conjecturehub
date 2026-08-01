import type { SourceKind } from "../types.js";

/** One thing we found somewhere that might be about a conjecture. */
export interface Candidate {
  /** Stable identity for deduplication across runs. */
  key: string;
  kind: SourceKind;
  url: string;
  title: string;
  text: string;
  authors: string[];
  /** ISO date, best effort. */
  published: string | null;
  /** Human-readable source label for logs and PR bodies. */
  origin: string;
}

export interface CandidateMatch {
  candidate: Candidate;
  conjectureId: string;
  conjectureTitle: string;
  /** Which name in the corpus matched. */
  matchedOn: string;
  /** 0..1, lexical confidence that this candidate is about this conjecture. */
  matchScore: number;
}

export interface ClassifiedMatch extends CandidateMatch {
  claimType: string | null;
  scope: string | null;
  confidence: number;
  evidence: string | null;
  rationale: string | null;
  classifier: string;
}
