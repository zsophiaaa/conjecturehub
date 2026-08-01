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
