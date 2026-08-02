import { getConjecture } from "@/lib/corpus";

/**
 * Checks a submission would pass, without writing anything.
 *
 * The real verifier lives in CI and needs Mathlib, so it cannot run in a request.
 * What it can do is catch the mistakes that actually happen, instantly and for
 * free: a proof that still contains `sorry`, one that reaches for an axiom the
 * allowlist forbids, one that imports the challenge module and so collides with
 * the name it is meant to prove, one aimed at a conjecture that has no challenge
 * to check against.
 *
 * Every one of these would otherwise cost a curator's attention and a CI run to
 * discover. An agent that can ask "would this be accepted?" before submitting
 * iterates in seconds instead of hours.
 */

export type Severity = "error" | "warning";

export interface CheckResult {
  severity: Severity;
  code: string;
  message: string;
}

export interface ValidationReport {
  wouldBeAccepted: boolean;
  errors: CheckResult[];
  warnings: CheckResult[];
}

const MAX_LEAN_BYTES = 512_000;

/**
 * Blocking an axiom by name does not work in general — since Lean 4.29 every
 * `native_decide` emits a uniquely named axiom, and one benchmark submission got
 * past a text filter by assembling a name through string concatenation. CI
 * enumerates what is permitted instead. These patterns are an early warning, not
 * the enforcement.
 */
const FORBIDDEN_PATTERNS: { pattern: RegExp; code: string; message: string }[] = [
  {
    pattern: /\bsorry\b/,
    code: "contains_sorry",
    message:
      "The proof contains `sorry`. A sorried proof proves nothing — the kernel will reject it.",
  },
  {
    pattern: /\bnative_decide\b/,
    code: "native_decide",
    message:
      "`native_decide` is not permitted: it emits its own axiom and trusts the compiler rather than the kernel.",
  },
  {
    pattern: /@\[implemented_by\]|@\[implemented_by\s/,
    code: "implemented_by",
    message: "`@[implemented_by]` is not permitted; it replaces a definition with unchecked code.",
  },
  {
    pattern: /^\s*axiom\s+\w/m,
    code: "declares_axiom",
    message:
      "The file declares an axiom. Only propext, Quot.sound and Classical.choice are permitted, and you cannot add your own.",
  },
  {
    pattern: /\badmit\b/,
    code: "contains_admit",
    message: "The proof contains `admit`, which is `sorry` by another name.",
  },
];

export function checkLeanSubmission(
  conjectureId: string,
  leanBody: string,
): ValidationReport {
  const errors: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  const conjecture = getConjecture(conjectureId);
  if (!conjecture) {
    errors.push({
      severity: "error",
      code: "unknown_conjecture",
      message: `No conjecture with id "${conjectureId}".`,
    });
    return { wouldBeAccepted: false, errors, warnings };
  }

  if (!conjecture.agent?.hasVerificationChallenge) {
    errors.push({
      severity: "error",
      code: "no_challenge",
      message:
        `"${conjectureId}" has no canonical statement to check a proof against, so nothing can be ` +
        "verified for it yet. Search with hasVerificationChallenge to find ones that can, or open a " +
        "pull request adding the statement first — statements are reviewed separately from proofs.",
    });
  }

  if (!leanBody.trim()) {
    errors.push({ severity: "error", code: "empty", message: "The submission is empty." });
    return { wouldBeAccepted: false, errors, warnings };
  }

  if (Buffer.byteLength(leanBody, "utf8") > MAX_LEAN_BYTES) {
    errors.push({
      severity: "error",
      code: "too_large",
      message: `The file exceeds ${MAX_LEAN_BYTES} bytes.`,
    });
  }

  for (const { pattern, code, message } of FORBIDDEN_PATTERNS) {
    if (pattern.test(leanBody)) errors.push({ severity: "error", code, message });
  }

  // The solution restates the theorem independently and is compared against the
  // challenge. Importing the challenge puts both declarations in scope and Lean
  // rejects the file with "has already been declared" — a confusing failure to
  // meet an hour into a CI run.
  const challengeModule = (conjecture.statement?.formal ?? [])
    .map((f) => f.theorem ?? "")
    .find((t) => t.startsWith("Challenge."))
    ?.split(".")
    .slice(0, 2)
    .join(".");

  if (challengeModule && new RegExp(`^\\s*import\\s+${challengeModule}\\b`, "m").test(leanBody)) {
    errors.push({
      severity: "error",
      code: "imports_challenge",
      message:
        `Do not \`import ${challengeModule}\`. Import Mathlib and restate the theorem in the same ` +
        "namespace; importing the challenge collides with the declaration you are proving.",
    });
  }

  if (!/^\s*import\s+Mathlib\b/m.test(leanBody)) {
    warnings.push({
      severity: "warning",
      code: "no_mathlib_import",
      message: "The file does not `import Mathlib`. That is usually a mistake.",
    });
  }

  const theoremNames = (conjecture.statement?.formal ?? [])
    .map((f) => f.theorem)
    .filter((t): t is string => Boolean(t));
  const bare = theoremNames.map((t) => t.split(".").pop()!).filter(Boolean);

  if (bare.length > 0 && !bare.some((n) => new RegExp(`\\b${n}\\b`).test(leanBody))) {
    errors.push({
      severity: "error",
      code: "missing_theorem",
      message:
        `The file does not declare any of the expected theorems (${bare.join(", ")}). ` +
        "A proof is checked against a specific statement; proving something else does not count.",
    });
  }

  return { wouldBeAccepted: errors.length === 0, errors, warnings };
}

const CLAIM_TYPES = new Set([
  "proved",
  "disproved",
  "counterexample",
  "partial",
  "independence",
  "resolved_by_prior_literature",
  "reformulation",
]);

export function checkClaimSubmission(input: {
  conjectureId: string;
  claimType: string;
  sourceUrl: string;
  scope?: string | null;
  notes?: string | null;
}): ValidationReport {
  const errors: CheckResult[] = [];
  const warnings: CheckResult[] = [];

  const conjecture = getConjecture(input.conjectureId);
  if (!conjecture) {
    errors.push({
      severity: "error",
      code: "unknown_conjecture",
      message: `No conjecture with id "${input.conjectureId}".`,
    });
    return { wouldBeAccepted: false, errors, warnings };
  }

  if (!CLAIM_TYPES.has(input.claimType)) {
    errors.push({
      severity: "error",
      code: "bad_claim_type",
      message: `"${input.claimType}" is not a claim type. One of: ${[...CLAIM_TYPES].join(", ")}.`,
    });
  }

  let url: URL | null = null;
  try {
    url = new URL(input.sourceUrl);
  } catch {
    errors.push({
      severity: "error",
      code: "bad_source_url",
      message: "sourceUrl must be an absolute http(s) URL. A claim without a source is not usable.",
    });
  }
  if (url && !/^https?:$/.test(url.protocol)) {
    errors.push({
      severity: "error",
      code: "bad_source_url",
      message: "sourceUrl must use http or https.",
    });
  }

  // The distinction that caused a public retraction in October 2025.
  if (input.claimType === "proved" && /already|existing|prior|known result|literature/i.test(input.notes ?? "")) {
    warnings.push({
      severity: "warning",
      code: "maybe_prior_literature",
      message:
        "The notes suggest you found an existing proof rather than produced one. If so this is " +
        "`resolved_by_prior_literature`, not `proved` — conflating the two is what made the " +
        "October 2025 Erdős announcement wrong.",
    });
  }

  // An unscoped resolution that contradicts an existing one fails corpus validation.
  const opposing = (conjecture.claims ?? []).filter((c) => {
    if (c.state !== "active" || c.scope) return false;
    const negative = new Set(["disproved", "counterexample"]);
    if (input.claimType === "proved") return negative.has(c.type);
    if (negative.has(input.claimType)) return c.type === "proved";
    return false;
  });

  if (opposing.length > 0 && !input.scope) {
    errors.push({
      severity: "error",
      code: "contradicts_existing",
      message:
        `This contradicts the active claim "${opposing[0]!.id}" (${opposing[0]!.type}) and neither ` +
        "is scoped, which the corpus validator rejects. Give a `scope` saying which part you settle, " +
        "or check whether the existing claim should be retracted first.",
    });
  }

  if (!input.notes?.trim()) {
    warnings.push({
      severity: "warning",
      code: "no_notes",
      message: "No notes. A curator has to judge this; two or three sentences make that possible.",
    });
  }

  return { wouldBeAccepted: errors.length === 0, errors, warnings };
}
