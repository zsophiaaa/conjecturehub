import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { validateConjecture } from "../lib/validate.js";
import { extractJson, type LlmProvider } from "../llm/provider.js";
import type { Claim, Conjecture } from "../types.js";

/**
 * Screens a pull request that touches the corpus.
 *
 * The deterministic checks come first and carry all the weight that matters.
 * The LLM stage only looks at prose quality on genuinely new submissions, and
 * it can never block a merge on its own -- it leaves a comment.
 */

export type Severity = "error" | "warning" | "note";

export interface Finding {
  severity: Severity;
  file: string;
  message: string;
}

function git(args: string[]): string {
  // stderr is discarded because callers use `git show` to probe for files that
  // may legitimately not exist at the base ref.
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

export function changedConjectureFiles(baseRef: string): string[] {
  const output = git(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`, "--", "conjectures/"]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".yaml"));
}

function readAtRef(ref: string, file: string): Conjecture | null {
  try {
    return YAML.parse(git(["show", `${ref}:${file}`])) as Conjecture;
  } catch {
    return null;
  }
}

function readWorking(file: string): Conjecture | null {
  try {
    return YAML.parse(git(["show", `HEAD:${file}`])) as Conjecture;
  } catch {
    return null;
  }
}

/** Everything about a claim except its state, which is allowed to change. */
function claimFingerprint(claim: Claim): string {
  const { state, ...rest } = claim;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

const CRANK_MARKERS = [
  /\bi have (?:finally )?(?:solved|proven|proved)\b/i,
  /\bmy (?:new )?(?:theory|proof|method) (?:of|for) everything\b/i,
  /\bthe (?:establishment|mainstream) (?:mathematicians?|community) (?:refuses?|refused|won'?t)\b/i,
  /\bnobel prize\b/i,
  /\bclay (?:institute|prize) (?:owes|should pay)\b/i,
];

const PLACEHOLDER_MARKERS = [/\blorem ipsum\b/i, /\bTODO\b/, /\bFIXME\b/, /\bXXX\b/, /^test$/i];

/**
 * The append-only rule, enforced mechanically. Rewriting history is the one
 * change that would quietly destroy the integrity of the whole model, so it is
 * an error rather than a review comment.
 */
function checkAppendOnly(file: string, base: Conjecture, head: Conjecture): Finding[] {
  const findings: Finding[] = [];
  const headById = new Map((head.claims ?? []).map((c) => [c.id, c]));

  for (const original of base.claims ?? []) {
    const current = headById.get(original.id);

    if (!current) {
      findings.push({
        severity: "error",
        file,
        message: `Claim "${original.id}" was deleted. Claims are append-only — set its state to "retracted" and add a new claim instead.`,
      });
      continue;
    }

    if (claimFingerprint(original) !== claimFingerprint(current)) {
      findings.push({
        severity: "error",
        file,
        message: `Claim "${original.id}" was edited in place. Only its "state" may change; to correct it, retract it and append a replacement with "supersedes: ${original.id}".`,
      });
    }

    if (original.state !== current.state && original.state !== "active") {
      findings.push({
        severity: "warning",
        file,
        message: `Claim "${original.id}" moved from "${original.state}" to "${current.state}". Reopening a retracted or disputed claim needs an explanation in the pull request.`,
      });
    }
  }

  if (base.id !== head.id) {
    findings.push({
      severity: "error",
      file,
      message: `The id changed from "${base.id}" to "${head.id}". Ids are permanent because other records and external links point at them.`,
    });
  }

  return findings;
}

function checkNewClaims(file: string, newClaims: Claim[]): Finding[] {
  const findings: Finding[] = [];

  for (const claim of newClaims) {
    let url: URL | null = null;
    try {
      url = new URL(claim.source.url);
    } catch {
      findings.push({ severity: "error", file, message: `Claim "${claim.id}" has an unparseable source URL.` });
      continue;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      findings.push({ severity: "error", file, message: `Claim "${claim.id}" must cite an http(s) URL.` });
    }

    if (url.pathname === "/" && !url.search) {
      findings.push({
        severity: "warning",
        file,
        message: `Claim "${claim.id}" cites a bare domain. Link to the specific paper, post or page.`,
      });
    }

    const prose = `${claim.notes ?? ""} ${claim.source.title ?? ""} ${claim.source.quote ?? ""}`;

    for (const marker of CRANK_MARKERS) {
      if (marker.test(prose)) {
        findings.push({
          severity: "warning",
          file,
          message: `Claim "${claim.id}" contains language typical of unsound submissions. A human should read this before merging.`,
        });
        break;
      }
    }

    for (const marker of PLACEHOLDER_MARKERS) {
      if (marker.test(prose)) {
        findings.push({
          severity: "error",
          file,
          message: `Claim "${claim.id}" still contains placeholder text.`,
        });
        break;
      }
    }

    if (claim.evidence_tier === "machine_verified" && !claim.verification?.run_url) {
      findings.push({
        severity: "error",
        file,
        message: `Claim "${claim.id}" asserts machine verification without linking the CI run that produced it. Verification receipts are written by the verification workflow, not by hand.`,
      });
    }

    if (claim.ai_assistance?.used === "unknown" && claim.evidence_tier !== "unverified_claim") {
      findings.push({
        severity: "note",
        file,
        message: `Claim "${claim.id}" does not declare whether AI assistance was used. Please say so explicitly.`,
      });
    }
  }

  return findings;
}

function checkNewRecord(file: string, record: Conjecture): Finding[] {
  const findings: Finding[] = [];
  const statement = record.statement?.informal ?? "";

  if (statement && statement.trim().length < 30) {
    findings.push({
      severity: "warning",
      file,
      message: "The statement is very short. A reader should be able to tell what is being conjectured without following a link.",
    });
  }

  for (const marker of PLACEHOLDER_MARKERS) {
    if (marker.test(statement) || marker.test(record.title)) {
      findings.push({ severity: "error", file, message: "Placeholder text in the title or statement." });
      break;
    }
  }

  const hasCrosswalk =
    Boolean(record.ids?.wikidata) ||
    Boolean(record.ids?.erdos) ||
    Boolean(record.ids?.formal_conjectures) ||
    Boolean(record.ids?.wikipedia) ||
    (record.ids?.oeis ?? []).length > 0 ||
    (record.ids?.external ?? []).length > 0;

  if (!hasCrosswalk) {
    findings.push({
      severity: "warning",
      file,
      message: "No identifiers or external links. New records need at least one, or we cannot tell this is not a duplicate of something already indexed.",
    });
  }

  return findings;
}

export interface ScreenResult {
  findings: Finding[];
  files: string[];
  newRecords: string[];
  newClaims: number;
}

export function screen(baseRef: string): ScreenResult {
  const files = changedConjectureFiles(baseRef);
  const findings: Finding[] = [];
  const newRecords: string[] = [];
  let newClaims = 0;

  for (const file of files) {
    const head = readWorking(file);
    if (!head) {
      findings.push({ severity: "error", file, message: "File could not be parsed as YAML." });
      continue;
    }

    for (const issue of validateConjecture(head)) {
      findings.push({ severity: "error", file, message: `${issue.path}: ${issue.message}` });
    }

    const base = readAtRef(baseRef, file);

    if (!base) {
      newRecords.push(file);
      findings.push(...checkNewRecord(file, head));
      findings.push(...checkNewClaims(file, head.claims ?? []));
      newClaims += (head.claims ?? []).length;
      continue;
    }

    findings.push(...checkAppendOnly(file, base, head));

    const baseIds = new Set((base.claims ?? []).map((c) => c.id));
    const added = (head.claims ?? []).filter((c) => !baseIds.has(c.id));
    newClaims += added.length;
    findings.push(...checkNewClaims(file, added));
  }

  return { findings, files, newRecords, newClaims };
}

const SCREEN_PROMPT = `You review submissions to a mathematical conjecture database. Judge presentation quality only. You are NOT judging whether the mathematics is correct, and you must not try.

Return ONLY JSON:
{"verdict": "ok" | "needs_work", "issues": [string], "summary": string}

Flag a submission as needs_work only for concrete, fixable problems:
- The statement is unintelligible, or so vague that it does not state a definite mathematical assertion.
- The statement is not a conjecture at all (an essay, a question with no claim, marketing, or off-topic text).
- Claimed sources plainly do not support what is being claimed about them.
- Obvious duplication of an existing well-known conjecture under a made-up name.

Do NOT flag: unusual notation, non-native English, unfamiliar subject areas, terse but precise statements, or a conjecture merely being obscure or unlikely. Obscure is fine. Wrong is not your call.`;

export async function llmScreen(
  provider: LlmProvider,
  records: { file: string; record: Conjecture }[],
): Promise<Finding[]> {
  if (!provider.available || records.length === 0) return [];

  const findings: Finding[] = [];

  for (const { file, record } of records.slice(0, 10)) {
    try {
      const response = await provider.complete(
        [
          { role: "system", content: SCREEN_PROMPT },
          {
            role: "user",
            content: [
              `TITLE: ${record.title}`,
              `STATEMENT: ${record.statement?.informal ?? "(none provided)"}`,
              `TAGS: ${(record.subject?.tags ?? []).join(", ") || "(none)"}`,
              `IDENTIFIERS: ${JSON.stringify(record.ids ?? {})}`,
              `CLAIMS: ${JSON.stringify((record.claims ?? []).map((c) => ({ type: c.type, tier: c.evidence_tier, source: c.source.url })))}`,
            ].join("\n"),
          },
        ],
        { maxTokens: 400 },
      );

      const verdict = extractJson<{ verdict?: string; issues?: string[]; summary?: string }>(response);
      if (verdict?.verdict === "needs_work") {
        findings.push({
          severity: "warning",
          file,
          message: `Automated quality screen: ${verdict.summary ?? "flagged"}${
            verdict.issues?.length ? ` (${verdict.issues.join("; ")})` : ""
          }. This is advisory — a human decides.`,
        });
      }
    } catch (error) {
      findings.push({
        severity: "note",
        file,
        message: `Quality screen could not run: ${(error as Error).message}`,
      });
    }
  }

  return findings;
}
