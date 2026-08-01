import fs from "node:fs";
import path from "node:path";
import { read, write, appendClaim, exists } from "../lib/conjecture.js";
import { validateConjecture } from "../lib/validate.js";
import { today } from "../lib/http.js";
import { REPO_ROOT } from "../lib/paths.js";
import type { Claim } from "../types.js";

/**
 * Writes machine-verification receipts into the corpus.
 *
 * This deliberately runs only from a workflow on the default branch, after a
 * proof has been merged. A receipt produced by CI on a contributor's branch
 * would be a receipt the contributor could influence, so nothing on a pull
 * request may write one.
 *
 *   --results DIR   directory of result JSON files from statements/verify.sh
 *   --run-url URL   the CI run that produced them
 *   --toolchain S   Lean toolchain and mathlib tag
 */

interface VerifyResult {
  challenge: string;
  outcome: "verified" | "rejected" | "exceeded_budget" | "setup_error";
  detail: string;
  elapsed_seconds: number;
}

interface ChallengeConfig {
  conjecture_id: string | null;
  comparator: {
    challenge_module: string;
    solution_module: string;
    theorem_names: string[];
    permitted_axioms: string[];
    enable_nanoda?: boolean;
  };
}

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const resultsDir = option("results", "verify-results")!;
const runUrl = option("run-url") ?? null;
const toolchain = option("toolchain", "unknown")!;

if (!fs.existsSync(resultsDir)) {
  console.log(`No results directory at ${resultsDir}; nothing to record.`);
  process.exit(0);
}

const files = fs.readdirSync(resultsDir).filter((f) => f.endsWith(".json"));
let recorded = 0;

for (const file of files) {
  const result = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf8")) as VerifyResult;

  if (result.outcome !== "verified") {
    console.log(`${result.challenge}: ${result.outcome}, no receipt written`);
    continue;
  }

  const configPath = path.join(REPO_ROOT, "statements", "challenges", `${result.challenge}.json`);
  if (!fs.existsSync(configPath)) {
    console.error(`${result.challenge}: no challenge config, skipping`);
    continue;
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as ChallengeConfig;
  const conjectureId = config.conjecture_id;

  if (!conjectureId) {
    console.log(`${result.challenge}: not linked to a conjecture (${config.comparator.challenge_module})`);
    continue;
  }

  if (!exists(conjectureId)) {
    console.error(`${result.challenge}: conjecture "${conjectureId}" does not exist`);
    continue;
  }

  const conjecture = read(conjectureId);
  const theorem = config.comparator.theorem_names[0] ?? "unknown";

  const claim: Claim = {
    id: `${conjectureId}-verified-${result.challenge}`,
    type: "proved",
    scope: null,
    evidence_tier: "machine_verified",
    state: "active",
    asserted_on: today(),
    recorded_on: today(),
    source: {
      kind: "manual",
      url: runUrl ?? `https://github.com/conjecturehub/conjecturehub/tree/main/statements/Solution`,
      title: `Machine-checked proof of ${theorem}`,
      quote: null,
    },
    authors: [],
    ai_assistance: { used: "unknown", systems: [] },
    reviewer: null,
    verification: {
      tool: "leanprover/comparator",
      tool_version: process.env.COMPARATOR_VERSION ?? null,
      proof_path: `statements/Solution/${config.comparator.solution_module.split(".").slice(1).join("/")}.lean`,
      statement_path: `statements/Challenge/${config.comparator.challenge_module.split(".").slice(1).join("/")}.lean`,
      theorem,
      toolchain,
      permitted_axioms: config.comparator.permitted_axioms,
      second_kernel: config.comparator.enable_nanoda ? "nanoda" : null,
      verified_on: today(),
      run_url: runUrl,
    },
    supersedes: null,
    notes: `Checked in ${Math.round(result.elapsed_seconds)}s. The kernel accepted this proof of the canonical statement; whether the canonical statement faithfully expresses the conjecture is a separate, human judgement recorded on the formal statement itself.`,
  };

  if (!appendClaim(conjecture, claim)) {
    console.log(`${result.challenge}: receipt already recorded`);
    continue;
  }

  const issues = validateConjecture(conjecture);
  if (issues.length > 0) {
    console.error(`${result.challenge}: receipt would be invalid — ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    process.exitCode = 1;
    continue;
  }

  write(conjecture);
  recorded++;
  console.log(`${result.challenge}: recorded machine_verified claim on ${conjectureId}`);
}

console.log(`\n${recorded} receipt(s) written.`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `recorded=${recorded}\n`);
}
