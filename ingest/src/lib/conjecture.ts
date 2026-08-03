import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONJECTURES_DIR } from "./paths.js";
import type { Conjecture } from "../types.js";

/**
 * Conjecture files are the database. They are read by humans in pull request
 * diffs, so serialization is deterministic: stable key order, stable list order,
 * no reflowed scalars. A bot appending one claim should produce a one-hunk diff.
 */

const KEY_ORDER = [
  "id",
  "title",
  "aliases",
  "statement",
  "informal",
  "formal",
  "language",
  "path",
  "theorem",
  "upstream",
  "toolchain",
  "category",
  "reviewed_by",
  "definition_hole",
  "subject",
  "msc",
  "tags",
  "ids",
  "wikidata",
  "erdos",
  "oeis",
  "formal_conjectures",
  "wikipedia",
  "arxiv",
  "mathworld",
  "external",
  "label",
  "url",
  "notability",
  "wikipedia_language_editions",
  "measured_on",
  "openness_basis",
  "meaning",
  "asserted_by",
  "asserted_on",
  "note",
  "claims",
  "type",
  "scope",
  "evidence_tier",
  "state",
  "recorded_on",
  "source",
  "kind",
  "title_",
  "quote",
  "authors",
  "ai_assistance",
  "used",
  "systems",
  "role",
  "reviewer",
  "verification",
  "tool",
  "tool_version",
  "proof_path",
  "statement_path",
  "permitted_axioms",
  "second_kernel",
  "verified_on",
  "run_url",
  "supersedes",
  "notes",
  "provenance",
  "fields",
  "license",
  "retrieved",
  "upstream_version",
];

const keyRank = new Map(KEY_ORDER.map((k, i) => [k, i]));

/**
 * `sortMapEntries` is handed Pair nodes, not key strings, and a Pair's key is
 * itself a Scalar node rather than a string. Reaching through both is the whole
 * job: stringifying the Pair yields its rendered form, every rank lookup misses,
 * and the file quietly comes out alphabetical.
 */
function pairKey(pair: unknown): string {
  const key = (pair as { key?: unknown })?.key;
  if (key && typeof key === "object" && "value" in key) return String((key as { value: unknown }).value);
  return String(key ?? pair);
}

function sortKeys(a: unknown, b: unknown): number {
  const an = pairKey(a);
  const bn = pairKey(b);
  const ak = keyRank.get(an) ?? 999;
  const bk = keyRank.get(bn) ?? 999;
  if (ak !== bk) return ak - bk;
  return an.localeCompare(bn);
}

/** Required by the schema, so they survive pruning even when empty. */
const ALWAYS_KEEP = new Set(["id", "title", "claims", "provenance", "openness_basis", "ids"]);

/** Drop keys whose value is an empty array/object or null, to keep files readable. */
function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => prune(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const keep = ALWAYS_KEEP.has(k);
      if (v === null || v === undefined) {
        if (keep) out[k] = v;
        continue;
      }
      if (Array.isArray(v) && v.length === 0 && !keep) continue;
      if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0 && !keep) {
        continue;
      }
      out[k] = prune(v);
    }
    return out as unknown as T;
  }
  return value;
}

/**
 * Practice targets. They live in the corpus so the API and MCP can serve them,
 * but they are not mathematics: they must not appear in a search, inflate a
 * count, or collect a verification receipt.
 *
 * Kept in step with SANDBOX_IDS in the web proof-proposal route, which cannot
 * import this across the workspace boundary.
 */
export const FIXTURE_IDS = new Set(["sandbox"]);

export function conjecturePath(id: string): string {
  return path.join(CONJECTURES_DIR, `${id}.yaml`);
}

export function serialize(conjecture: Conjecture): string {
  return YAML.stringify(prune(conjecture), {
    sortMapEntries: sortKeys,
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN",
    blockQuote: "literal",
  });
}

export function write(conjecture: Conjecture): void {
  fs.mkdirSync(CONJECTURES_DIR, { recursive: true });
  fs.writeFileSync(conjecturePath(conjecture.id), serialize(conjecture), "utf8");
}

export function read(id: string): Conjecture {
  return YAML.parse(fs.readFileSync(conjecturePath(id), "utf8")) as Conjecture;
}

export function exists(id: string): boolean {
  return fs.existsSync(conjecturePath(id));
}

export function listIds(): string[] {
  if (!fs.existsSync(CONJECTURES_DIR)) return [];
  return fs
    .readdirSync(CONJECTURES_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.slice(0, -".yaml".length))
    .sort();
}

export function readAll(): Conjecture[] {
  return listIds().map(read);
}

/**
 * Append a claim, refusing duplicates by id. Claims are append-only: to withdraw
 * one, add a new claim and set the old one's state to "retracted" explicitly.
 */
export function appendClaim(conjecture: Conjecture, claim: Conjecture["claims"][number]): boolean {
  conjecture.claims ??= [];
  if (conjecture.claims.some((c) => c.id === claim.id)) return false;
  conjecture.claims.push(claim);
  return true;
}

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}
