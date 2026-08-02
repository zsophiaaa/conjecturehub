import YAML from "yaml";
import fs from "node:fs";
import { listIds, conjecturePath } from "../lib/conjecture.js";
import { validateConjecture } from "../lib/validate.js";
import { loadAgentBenchmark } from "../lib/agent-benchmark.js";

/**
 * Validates every conjecture file against the schema plus the semantic rules
 * that protect the status model. This runs on every pull request.
 */

const ids = listIds();
if (ids.length === 0) {
  console.error("No conjecture files found. Run `npm run seed` first.");
  process.exit(1);
}

let failed = 0;
let claims = 0;

for (const id of ids) {
  const file = conjecturePath(id);
  let parsed: unknown;

  try {
    parsed = YAML.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failed++;
    console.error(`${id}: unparseable YAML — ${(error as Error).message}`);
    continue;
  }

  const record = parsed as { id?: string; claims?: unknown[] };
  if (record.id !== id) {
    failed++;
    console.error(`${id}: id field is "${record.id}" but the filename says "${id}"`);
    continue;
  }

  claims += record.claims?.length ?? 0;

  const issues = validateConjecture(parsed);
  if (issues.length > 0) {
    failed++;
    console.error(`\n${id}:`);
    for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
  }
}

// The benchmark list points at conjecture ids by hand. A typo would quietly drop
// a problem from the agent-facing set, so it is checked here rather than at
// index build time.
const known = new Set(ids);
const benchmark = loadAgentBenchmark();
const danglingBenchmarkIds = [
  ...benchmark.challenges.map((c) => c.id),
  ...(benchmark.ai_trace_examples ?? []).map((e) => e.id),
].filter((id) => !known.has(id));

if (danglingBenchmarkIds.length > 0) {
  failed++;
  console.error(
    `\nbenchmarks/agent-challenges.yaml: unknown conjecture id(s) ${danglingBenchmarkIds.join(", ")}`,
  );
}

console.log(
  failed === 0
    ? `\nOK — ${ids.length} conjectures, ${claims} claims, ${benchmark.challenges.length} benchmark entries, all valid.`
    : `\n${failed} check(s) failed across ${ids.length} conjecture file(s).`,
);

process.exit(failed === 0 ? 0 : 1);
