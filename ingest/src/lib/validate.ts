import fs from "node:fs";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { SCHEMA_PATH } from "./paths.js";
import type { Conjecture } from "../types.js";
import { TIER_ORDER } from "./status.js";

let cached: ValidateFunction | null = null;

function compile(): ValidateFunction {
  if (cached) return cached;
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false, useDefaults: false });
  addFormats(ajv);
  cached = ajv.compile(schema);
  return cached;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

function formatAjv(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((e) => ({
    path: e.instancePath || "/",
    message: `${e.message ?? "invalid"}${e.params && Object.keys(e.params).length ? ` (${JSON.stringify(e.params)})` : ""}`,
  }));
}

/** Which way a resolving claim points. Scope is what makes two directions compatible. */
function direction(type: string): "affirmative" | "negative" | "independent" | null {
  if (type === "proved") return "affirmative";
  if (type === "disproved" || type === "counterexample") return "negative";
  if (type === "independence") return "independent";
  return null;
}

/** A moving branch cannot back a reproducible machine check. */
const MUTABLE_REF = /\/(blob|tree|raw)\/(main|master|HEAD)\//;

/**
 * Checks that a record does not contradict itself.
 *
 * Erdős 90 — the unit distance conjecture, publicly disproved — displayed as
 * "Proved" because an imported claim said `proved` while the upstream status
 * claim said `disproved`, both unscoped and at the same tier. Status derivation
 * broke the tie on array order. Scope is the escape hatch: the Jacobian
 * conjecture is legitimately false for n >= 3 and open for n = 2, and says so.
 */
function contradictionChecks(c: Conjecture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const unscoped = (c.claims ?? []).filter((cl) => cl.state === "active" && !cl.scope);

  const byDirection = new Map<string, string[]>();
  for (const claim of unscoped) {
    const d = direction(claim.type);
    if (!d) continue;
    byDirection.set(d, [...(byDirection.get(d) ?? []), claim.id]);
  }

  if (byDirection.size > 1) {
    const summary = [...byDirection.entries()]
      .map(([d, ids]) => `${d} (${ids.join(", ")})`)
      .join(" vs ");
    issues.push({
      path: "/claims",
      message: `active claims contradict each other with no scope to separate them: ${summary}`,
    });
  }

  for (const [i, claim] of (c.claims ?? []).entries()) {
    if (claim.evidence_tier !== "machine_verified") continue;
    if (MUTABLE_REF.test(claim.source.url)) {
      issues.push({
        path: `/claims/${i}/source/url`,
        message:
          "a machine_verified claim must cite an immutable ref (a commit SHA or tag), not a branch",
      });
    }
  }

  return issues;
}

/**
 * Rules the JSON Schema cannot express. These are the ones that protect the
 * integrity of the status model, so they are errors rather than warnings.
 */
function semanticChecks(c: Conjecture): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const [i, claim] of (c.claims ?? []).entries()) {
    const at = `/claims/${i}`;

    if (seen.has(claim.id)) {
      issues.push({ path: `${at}/id`, message: `duplicate claim id "${claim.id}"` });
    }
    seen.add(claim.id);

    if (!claim.id.startsWith(`${c.id}-`)) {
      issues.push({
        path: `${at}/id`,
        message: `claim id must be prefixed with the conjecture id ("${c.id}-...")`,
      });
    }

    if (claim.evidence_tier === "machine_verified" && !claim.verification) {
      issues.push({ path: at, message: "machine_verified requires a verification receipt" });
    }

    if (claim.verification && claim.evidence_tier !== "machine_verified") {
      issues.push({
        path: at,
        message: "a verification receipt is only meaningful at evidence_tier machine_verified",
      });
    }

    // Automation is allowed to record claims, never to bless them.
    if (TIER_ORDER.indexOf(claim.evidence_tier) > TIER_ORDER.indexOf("preprint")) {
      if (claim.evidence_tier !== "machine_verified" && !claim.reviewer) {
        issues.push({
          path: `${at}/reviewer`,
          message: `evidence_tier "${claim.evidence_tier}" requires a named human reviewer`,
        });
      }
    }

    if (claim.supersedes && !(c.claims ?? []).some((o) => o.id === claim.supersedes)) {
      issues.push({
        path: `${at}/supersedes`,
        message: `supersedes references unknown claim "${claim.supersedes}"`,
      });
    }

    if (claim.asserted_on && claim.recorded_on && claim.asserted_on > claim.recorded_on) {
      issues.push({
        path: `${at}/asserted_on`,
        message: "claim was asserted after it was recorded, which is impossible",
      });
    }
  }

  issues.push(...contradictionChecks(c));

  const covered = new Set((c.provenance ?? []).flatMap((p) => p.fields));
  if (c.statement?.informal && !covered.has("statement.informal")) {
    issues.push({
      path: "/provenance",
      message: "statement.informal has no provenance entry, so we cannot say who owns the text",
    });
  }

  return issues;
}

export function validateConjecture(value: unknown): ValidationIssue[] {
  const validate = compile();
  const ok = validate(value);
  const issues = ok ? [] : formatAjv(validate.errors);
  if (issues.length > 0) return issues;
  return semanticChecks(value as Conjecture);
}
