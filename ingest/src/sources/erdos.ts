import YAML from "yaml";
import { fetchJson, fetchText } from "../lib/http.js";

/**
 * Ingests teorth/erdosproblems, the community metadata database behind
 * erdosproblems.com.
 *
 * This file is the highest-value source in the landscape because it already
 * contains crosswalks: `oeis` links problems to OEIS sequences, and the
 * formalization flags line up with formal-conjectures paths by problem number.
 * It carries metadata only — the statement text lives on erdosproblems.com and
 * in formal-conjectures, so we take statements from the latter.
 */

export const REPO = "teorth/erdosproblems";
export const DATA_PATH = "data/problems.yaml";
export const LICENSE = "Apache-2.0";
export const HOMEPAGE = "https://www.erdosproblems.com";

export interface ErdosStatus {
  state: string;
  last_update?: string;
}

export interface ErdosProblem {
  number: string;
  prize?: string;
  informal_status?: ErdosStatus;
  formal_status?: ErdosStatus;
  status?: ErdosStatus;
  formalized?: ErdosStatus;
  oeis?: string[];
  tags?: string[];
  comments?: string;
}

export async function resolveCommit(): Promise<{ sha: string; date: string }> {
  const commits = await fetchJson<{ sha: string; commit: { committer: { date: string } } }[]>(
    `https://api.github.com/repos/${REPO}/commits?path=${DATA_PATH}&per_page=1`,
    { ttl: 3600 },
  );
  const head = commits[0];
  if (!head) throw new Error("could not resolve a commit for erdosproblems data");
  return { sha: head.sha, date: head.commit.committer.date.slice(0, 10) };
}

export async function loadAll(): Promise<{ commit: string; date: string; problems: ErdosProblem[] }> {
  const { sha, date } = await resolveCommit();
  const raw = await fetchText(
    `https://raw.githubusercontent.com/${REPO}/${sha}/${DATA_PATH}`,
    { ttl: 86400 },
  );
  const problems = YAML.parse(raw) as ErdosProblem[];
  return { commit: sha, date, problems };
}

/**
 * Upstream encodes both the resolution and whether it was formalized into one
 * string, e.g. "proved (Lean)". Split them apart.
 */
export function parseState(state: string | undefined): {
  resolution: string;
  leanFormalized: boolean;
} {
  const raw = (state ?? "").trim();
  const leanFormalized = /\(Lean\)/i.test(raw);
  return { resolution: raw.replace(/\s*\(Lean\)\s*/i, "").trim(), leanFormalized };
}

export type Resolution =
  | "open"
  | "proved"
  | "disproved"
  | "solved"
  | "independent"
  | "decidable"
  | "falsifiable"
  | "verifiable"
  | "not disprovable"
  | "not provable";

/** Maps an upstream resolution word onto our claim vocabulary. Null means "no claim to record". */
export function resolutionToClaimType(
  resolution: string,
): "proved" | "disproved" | "independence" | "partial" | null {
  switch (resolution) {
    case "proved":
      return "proved";
    case "disproved":
      return "disproved";
    case "independent":
    case "not provable":
    case "not disprovable":
      return "independence";
    case "solved":
      // "solved" means resolved without recording which direction.
      return "proved";
    case "decidable":
    case "falsifiable":
    case "verifiable":
      // Statements about the form of the problem, not about it being settled.
      return "partial";
    case "open":
    default:
      return null;
  }
}

export function problemUrl(number: string): string {
  return `${HOMEPAGE}/${number}`;
}

/** Upstream uses "N/A" as a sentinel for "no linked sequence", and repeats some ids. */
export function cleanOeis(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).filter((v) => /^A\d{6}$/.test(v)))];
}
