import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "../lib/paths.js";
import { resolveProvider, type ChatMessage } from "../llm/provider.js";

/**
 * Drives a real model through the whole agent loop: read a statement over the
 * public API, draft a Lean proof, dry-run it, submit it, wait for the kernel.
 *
 * This is the reference harness for `docs/AGENTS.md`. Everything it does an
 * outside agent can do with the same public endpoints and one API key — there
 * is no privileged path. Pointing it at `sandbox` answers the question the
 * sandbox exists to answer: is my submission path working? Every other target
 * is an open problem, so a failure there says nothing about the harness.
 *
 *   --base URL        deployment to talk to
 *   --conjecture ID   target (default: sandbox)
 *   --model NAME      overrides LLM_MODEL
 *   --attempts N      drafts before giving up (default: 4)
 *   --dry-run         validate only; submit nothing and spend no CI
 *   --timeout SEC     how long to wait for a verdict (default: 1800)
 *
 * Needs CONJECTUREHUB_API_KEY to submit, and either GROQ_API_KEY or any
 * OpenAI-compatible LLM_BASE_URL + LLM_API_KEY to draft.
 */

const DEFAULT_BASE = "https://conjecture-hub-test.vercel.app";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";
const POLL_INTERVAL_MS = 15_000;
/**
 * Generous because the good models here reason before answering, and those
 * tokens come out of the same budget. gpt-oss-120b spends roughly 2,500 of them
 * thinking about a one-line proof and writes nothing at all if it runs out.
 */
const MAX_PROOF_TOKENS = 6000;

/** The job is finished only in these states; anything else means keep waiting. */
const TERMINAL = new Set(["verified", "rejected", "failed", "exceeded_budget"]);

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Local runs read .env; CI passes the environment in directly.
const envFile = path.join(REPO_ROOT, ".env");
if (fs.existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Older Node, or an unparseable file. Fall back to the ambient environment.
  }
}

/**
 * Groq is what this project actually runs on, so wire it up from GROQ_API_KEY
 * alone rather than making every caller restate the same three variables.
 */
function llmEnv(): NodeJS.ProcessEnv {
  const model = option("model") ?? process.env.LLM_MODEL;
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    return model ? { ...process.env, LLM_MODEL: model } : process.env;
  }
  if (process.env.GROQ_API_KEY) {
    return {
      ...process.env,
      LLM_BASE_URL: GROQ_BASE_URL,
      LLM_API_KEY: process.env.GROQ_API_KEY,
      LLM_MODEL: model ?? DEFAULT_GROQ_MODEL,
    };
  }
  return process.env;
}

interface Formal {
  language?: string;
  theorem?: string;
  upstream?: string;
}

interface ConjectureDetail {
  id: string;
  title: string;
  statement?: { informal?: string; formal?: Formal[] };
}

interface CheckResult {
  code: string;
  message: string;
}

interface ValidationReport {
  wouldBeAccepted: boolean;
  errors: CheckResult[];
  warnings: CheckResult[];
}

const base = (option("base") ?? process.env.CONJECTUREHUB_BASE_URL ?? DEFAULT_BASE).replace(
  /\/$/,
  "",
);
const conjectureId = option("conjecture") ?? "sandbox";
const maxAttempts = Number(option("attempts") ?? 4);
const timeoutSeconds = Number(option("timeout") ?? 1800);
const dryRun = flag("dry-run");

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * The exact Lean signature matters more than the prose: the comparator checks
 * the submission against this declaration, so a proof of something adjacent is
 * a rejection. Fetch the canonical file rather than asking the model to
 * reconstruct it from an informal description.
 */
async function fetchChallengeSource(upstream: string | undefined): Promise<string | null> {
  if (!upstream) return null;
  const raw = upstream
    .replace("https://github.com/", "https://raw.githubusercontent.com/")
    .replace("/blob/", "/");
  try {
    const res = await fetch(raw);
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Models wrap code in fences and preface it with commentary; keep only the Lean. */
function extractLean(text: string): string {
  const fenced = /```(?:lean4?|)\s*\n([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
}

function describeReport(report: ValidationReport): string {
  const lines: string[] = [];
  for (const e of report.errors) lines.push(`  error   [${e.code}] ${e.message}`);
  for (const w of report.warnings) lines.push(`  warning [${w.code}] ${w.message}`);
  return lines.join("\n");
}

/**
 * Hands a failed draft back for repair.
 *
 * ChatMessage has no assistant role, so the rejected attempt travels inside the
 * next request. The model needs to see what it wrote: told only that something
 * failed, it tends to produce a variation on the same mistake.
 */
function revise(leanBody: string, why: string): ChatMessage {
  return {
    role: "user",
    content:
      "Your previous answer did not work:\n\n```lean\n" +
      `${leanBody}\n` +
      "```\n\n" +
      `${why}\n\n` +
      "Fix it and reply with the corrected file. If a single Mathlib lemma settles this, " +
      "use it rather than a case split you then have to finish by hand.",
  };
}

const provider = resolveProvider(llmEnv());
if (!provider.available) {
  console.error(
    "No LLM configured. Set GROQ_API_KEY, or LLM_BASE_URL + LLM_API_KEY for any\n" +
      "OpenAI-compatible endpoint.",
  );
  process.exit(1);
}

console.log(`Target     ${base}/conjectures/${conjectureId}/`);
console.log(`Model      ${provider.name}`);
console.log(`Mode       ${dryRun ? "dry run — nothing will be submitted" : "live submission"}\n`);

const { conjecture } = await getJson<{ conjecture: ConjectureDetail }>(
  `${base}/api/v1/conjectures/${conjectureId}`,
);

const formal = (conjecture.statement?.formal ?? []).find((f) => f.language === "lean4");
if (!formal?.theorem) {
  console.error(`"${conjectureId}" has no Lean formalization, so there is nothing to prove.`);
  process.exit(1);
}

const challengeSource = await fetchChallengeSource(formal.upstream);
console.log(`Statement  ${conjecture.title}`);
console.log(`Theorem    ${formal.theorem}`);
console.log(`Challenge  ${challengeSource ? "fetched" : "unavailable, using the prose only"}\n`);

const SYSTEM = `You write Lean 4 proofs against current Mathlib.

Reply with one fenced \`\`\`lean block and nothing else. No commentary.

Hard rules, each of which makes a submission fail:
- Never write \`sorry\`, \`admit\`, \`native_decide\`, or declare an \`axiom\`.
- Start the file with \`import Mathlib\`.
- Do NOT import the Challenge module. Restate the theorem yourself in the same
  namespace; importing it collides with the declaration you are proving.
- Declare the theorem under exactly the name and signature you were given.
- Only propext, Quot.sound and Classical.choice are permitted axioms.

Prefer the shortest proof that a Lean kernel accepts.`;

function buildRequest(): string {
  const parts = [
    `Prove \`${formal!.theorem}\`.`,
    "",
    `Informal statement:\n${conjecture.statement?.informal ?? "(none given)"}`,
  ];
  if (challengeSource) {
    parts.push(
      "",
      "This is the canonical challenge file. Reproduce the declaration exactly as it",
      "appears here, in the same namespace, with the `sorry` replaced by a real proof:",
      "",
      "```lean",
      challengeSource.trim(),
      "```",
    );
  }
  return parts.join("\n");
}

interface Job {
  status: string;
  outcome: string | null;
  elapsedSeconds: number | null;
  logUrl: string | null;
}

/** Waits for CI. Returns null if the deadline passes while the job is still open. */
async function awaitVerdict(jobId: number): Promise<Job | null> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  const started = Date.now();
  let last = "";

  while (Date.now() < deadline) {
    const job = await getJson<Job>(`${base}/api/v1/verification-jobs/${jobId}`);

    if (job.status !== last) {
      const elapsed = Math.round((Date.now() - started) / 1000);
      console.log(`  [${elapsed}s] ${job.status}${job.logUrl ? `  ${job.logUrl}` : ""}`);
      last = job.status;
    }
    if (TERMINAL.has(job.status)) return job;

    await sleep(POLL_INTERVAL_MS);
  }

  console.error(
    `\nStill "${last}" after ${timeoutSeconds}s. The job outlived this poll, not necessarily CI:\n` +
      `  ${base}/api/v1/verification-jobs/${jobId}`,
  );
  return null;
}

const apiKey = process.env.CONJECTUREHUB_API_KEY;
if (!dryRun && !apiKey) {
  console.error(
    "CONJECTUREHUB_API_KEY is not set, so there is nothing to submit with.\n" +
      `Register an agent at ${base}/agents/ and put the key in .env, or pass --dry-run.`,
  );
  process.exit(1);
}

const messages: ChatMessage[] = [
  { role: "system", content: SYSTEM },
  { role: "user", content: buildRequest() },
];

let verified = false;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  console.log(`Draft ${attempt}/${maxAttempts}...`);

  const reply = await provider.complete(messages, { maxTokens: MAX_PROOF_TOKENS });
  const leanBody = extractLean(reply);
  if (!leanBody) {
    console.log("  the model returned nothing usable\n");
    continue;
  }

  console.log(`${leanBody.split("\n").map((l) => `  | ${l}`).join("\n")}\n`);

  const report = await fetch(`${base}/api/v1/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "lean", conjectureId, leanBody }),
  }).then((r) => r.json() as Promise<ValidationReport>);

  if (!report.wouldBeAccepted) {
    console.log(describeReport(report));
    console.log("  rejected by dry run, which costs nothing; asking for a revision\n");
    messages.push(revise(leanBody, report.errors.map((e) => `- ${e.message}`).join("\n")));
    continue;
  }

  if (report.warnings.length > 0) console.log(describeReport(report));
  console.log("  validation passed\n");

  if (dryRun) {
    console.log("Dry run: stopping before submission.");
    process.exit(0);
  }

  const submitRes = await fetch(`${base}/api/v1/conjectures/${conjectureId}/proofs/propose`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ leanBody }),
  });

  const submission = (await submitRes.json()) as {
    error?: string;
    proposalId?: number;
    verificationJobId?: number | null;
    duplicate?: boolean;
    message?: string;
  };

  if (!submitRes.ok) {
    console.error(`Submission failed (HTTP ${submitRes.status}): ${submission.error}`);
    process.exit(1);
  }

  // An identical resubmission returns the original rather than queueing another
  // CI run, so a model that repeats itself gets the earlier verdict back
  // immediately instead of spending ten minutes rediscovering it.
  console.log(
    `Submitted  proposal #${submission.proposalId}` +
      (submission.duplicate ? " (identical to an earlier one, reusing its verdict)" : ""),
  );

  const jobId = submission.verificationJobId;
  if (!jobId) {
    console.log(`${submission.message}\n`);
    console.log("No verification job was created, so there is no verdict to wait for.");
    process.exit(1);
  }

  const job = await awaitVerdict(jobId);
  if (!job) process.exit(1);

  if (job.status === "verified") {
    console.log(`\nVerdict    verified by the Lean kernel in ${job.elapsedSeconds ?? "?"}s`);
    if (job.logUrl) console.log(`Log        ${job.logUrl}`);
    verified = true;
    break;
  }

  console.log(`\nVerdict    ${job.status}`);
  if (job.logUrl) console.log(`Log        ${job.logUrl}`);
  if (job.outcome) console.log(`\n${job.outcome}\n`);

  if (job.status !== "rejected") {
    // Exceeded the budget or the pipeline broke. Neither says the proof is
    // wrong, so there is nothing to feed back and no reason to redraft.
    process.exit(1);
  }

  messages.push(
    revise(
      leanBody,
      `Lean rejected it:\n\n${job.outcome ?? "(no detail was reported)"}`,
    ),
  );
}

if (!verified) {
  console.error(`\nNo draft was verified in ${maxAttempts} attempts.`);
  process.exit(1);
}
