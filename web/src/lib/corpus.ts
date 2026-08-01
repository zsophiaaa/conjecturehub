import fs from "node:fs";
import path from "node:path";

/**
 * Build-time access to the corpus. `.generated/corpus.json` is produced by
 * `npm run build:index` from the YAML files, which stay the source of truth.
 */

export type EvidenceTier =
  | "unverified_claim"
  | "preprint"
  | "published"
  | "community_accepted"
  | "machine_verified";

export interface Claim {
  id: string;
  type: string;
  scope?: string | null;
  evidence_tier: EvidenceTier;
  state: "active" | "disputed" | "retracted";
  asserted_on?: string | null;
  recorded_on: string;
  source: { kind: string; url: string; title?: string | null; quote?: string | null };
  authors?: string[];
  ai_assistance?: { used?: string; systems?: string[]; role?: string | null };
  reviewer?: string | null;
  verification?: {
    tool: string;
    tool_version?: string | null;
    statement_path: string;
    theorem: string;
    toolchain: string;
    permitted_axioms: string[];
    second_kernel?: string | null;
    verified_on: string;
    run_url?: string | null;
  };
  supersedes?: string | null;
  notes?: string | null;
}

export interface DerivedStatus {
  key: string;
  label: string;
  tier: EvidenceTier | null;
  scoped: boolean;
  scope: string | null;
  caveat: string;
  decidedBy: string | null;
}

export interface Conjecture {
  id: string;
  title: string;
  aliases?: string[];
  statement?: {
    informal?: string | null;
    formal?: {
      language: string;
      path?: string | null;
      theorem?: string | null;
      upstream: string;
      toolchain?: string | null;
      category?: string | null;
      reviewed_by?: string | null;
      definition_hole?: boolean;
    }[];
  };
  subject?: { msc?: string[]; tags?: string[] };
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
    meaning: string;
    asserted_by?: string | null;
    asserted_on?: string | null;
    note?: string | null;
  };
  claims: Claim[];
  provenance: {
    fields: string[];
    source: string;
    url?: string | null;
    license: string;
    retrieved: string;
    upstream_version?: string | null;
  }[];
  derived: DerivedStatus;
}

export interface Stats {
  generatedAt: string;
  total: number;
  claims: number;
  withLeanStatement: number;
  withWikidata: number;
  withErdos: number;
  withOeis: number;
  crossLinked: number;
  byStatus: Record<string, number>;
  byTier: Record<string, number>;
  topTags: { tag: string; count: number }[];
}

const GENERATED = path.join(process.cwd(), ".generated");

function readGenerated<T>(file: string, hint: string): T {
  const full = path.join(GENERATED, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing ${full}. Run \`npm run build:index\` from the repo root first (${hint}).`);
  }
  return JSON.parse(fs.readFileSync(full, "utf8")) as T;
}

let corpusCache: Conjecture[] | null = null;

export function getCorpus(): Conjecture[] {
  corpusCache ??= readGenerated<Conjecture[]>("corpus.json", "it compiles conjectures/*.yaml");
  return corpusCache;
}

export function getConjecture(id: string): Conjecture | undefined {
  return getCorpus().find((c) => c.id === id);
}

export function getStats(): Stats {
  return readGenerated<Stats>("stats.json", "it summarizes the corpus");
}

export const SITE = {
  name: "ConjectureHub",
  tagline: "A living index of every mathematical conjecture, and who has proved what.",
  repo: "https://github.com/conjecturehub/conjecturehub",
} as const;
