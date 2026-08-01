/**
 * TypeScript mirror of schema/conjecture.schema.json.
 * The JSON Schema is authoritative; these types exist for editor support.
 */

export type EvidenceTier =
  | "unverified_claim"
  | "preprint"
  | "published"
  | "community_accepted"
  | "machine_verified";

export type ClaimType =
  | "proved"
  | "disproved"
  | "counterexample"
  | "partial"
  | "independence"
  | "resolved_by_prior_literature"
  | "reformulation";

export type ClaimState = "active" | "disputed" | "retracted";

export type SourceKind =
  | "arxiv"
  | "journal"
  | "preprint"
  | "x"
  | "mastodon"
  | "bluesky"
  | "zulip"
  | "blog"
  | "wikipedia"
  | "hackernews"
  | "mathoverflow"
  | "dataset"
  | "manual";

export interface ClaimSource {
  kind: SourceKind;
  url: string;
  title?: string | null;
  quote?: string | null;
}

export interface Verification {
  tool: string;
  tool_version?: string | null;
  proof_path?: string | null;
  statement_path: string;
  theorem: string;
  toolchain: string;
  permitted_axioms: string[];
  second_kernel?: string | null;
  verified_on: string;
  run_url?: string | null;
}

export interface Claim {
  id: string;
  type: ClaimType;
  scope?: string | null;
  evidence_tier: EvidenceTier;
  state: ClaimState;
  asserted_on?: string | null;
  recorded_on: string;
  source: ClaimSource;
  authors?: string[];
  ai_assistance?: {
    used?: "yes" | "no" | "unknown";
    systems?: string[];
    role?: string | null;
  };
  reviewer?: string | null;
  verification?: Verification;
  supersedes?: string | null;
  notes?: string | null;
}

export interface FormalStatement {
  language: "lean4" | "isabelle" | "rocq" | "metamath";
  path?: string | null;
  theorem?: string | null;
  upstream: string;
  toolchain?: string | null;
  category?: string | null;
  reviewed_by?: string | null;
  definition_hole?: boolean;
}

export interface Provenance {
  fields: string[];
  source: string;
  url?: string | null;
  license: string;
  retrieved: string;
  upstream_version?: string | null;
}

export interface Conjecture {
  id: string;
  title: string;
  aliases?: string[];
  statement?: {
    informal?: string | null;
    formal?: FormalStatement[];
  };
  subject?: {
    msc?: string[];
    tags?: string[];
  };
  ids?: {
    wikidata?: string | null;
    erdos?: string | null;
    oeis?: string[];
    formal_conjectures?: string | null;
    wikipedia?: string | null;
    arxiv?: string[];
    mathworld?: string | null;
    external?: { label: string; url: string }[];
  };
  openness_basis: {
    meaning:
      | "no_published_solution_known_to_curator"
      | "no_solution_known_to_community"
      | "proven_undecidable"
      | "unknown";
    asserted_by?: string | null;
    asserted_on?: string | null;
    note?: string | null;
  };
  claims: Claim[];
  provenance: Provenance[];
}
