import YAML from "yaml";
import fs from "node:fs";
import { listIds, conjecturePath } from "../lib/conjecture.js";
import { validateConjecture } from "../lib/validate.js";

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

console.log(
  failed === 0
    ? `\nOK — ${ids.length} conjectures, ${claims} claims, all valid.`
    : `\n${failed} of ${ids.length} conjecture file(s) failed validation.`,
);

process.exit(failed === 0 ? 0 : 1);
