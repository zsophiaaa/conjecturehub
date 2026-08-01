import fs from "node:fs";
import YAML from "yaml";
import { execFileSync } from "node:child_process";
import { screen, llmScreen, type Finding } from "../screen/screen.js";
import { resolveProvider } from "../llm/provider.js";
import type { Conjecture } from "../types.js";

/**
 * Screens a pull request touching the corpus.
 *
 *   --base REF      compare against this ref (default: origin/main)
 *   --comment PATH  write a markdown summary for a pull request comment
 *   --no-llm        skip the advisory quality screen
 *
 * Exits non-zero only on errors. Warnings and notes are advisory: an automated
 * reviewer that can block a merge is an automated reviewer that will eventually
 * block the right answer.
 */

function option(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

const baseRef = option("base", "origin/main")!;
const result = screen(baseRef);

if (result.files.length === 0) {
  console.log("No conjecture files changed.");
  process.exit(0);
}

const findings: Finding[] = [...result.findings];

if (!process.argv.includes("--no-llm") && result.newRecords.length > 0) {
  const provider = resolveProvider();
  const records = result.newRecords
    .map((file) => {
      try {
        const yaml = execFileSync("git", ["show", `HEAD:${file}`], { encoding: "utf8" });
        return { file, record: YAML.parse(yaml) as Conjecture };
      } catch {
        return null;
      }
    })
    .filter((r): r is { file: string; record: Conjecture } => r !== null);

  findings.push(...(await llmScreen(provider, records)));
}

const errors = findings.filter((f) => f.severity === "error");
const warnings = findings.filter((f) => f.severity === "warning");
const notes = findings.filter((f) => f.severity === "note");

console.log(
  `Screened ${result.files.length} file(s): ${result.newRecords.length} new record(s), ${result.newClaims} new claim(s).`,
);

const ICON: Record<Finding["severity"], string> = { error: "✗", warning: "!", note: "·" };
for (const finding of findings) {
  console.log(`  ${ICON[finding.severity]} ${finding.file}: ${finding.message}`);
}

const commentPath = option("comment");
if (commentPath) {
  const lines = [
    "## Corpus screening",
    "",
    `Checked ${result.files.length} changed file(s): **${result.newRecords.length}** new record(s), **${result.newClaims}** new claim(s).`,
    "",
  ];

  if (errors.length === 0 && warnings.length === 0) {
    lines.push("Everything checks out. Schema is valid and no claim history was rewritten.", "");
  }

  const section = (title: string, items: Finding[], preamble: string) => {
    if (items.length === 0) return;
    lines.push(`### ${title}`, "", preamble, "");
    for (const item of items) lines.push(`- \`${item.file}\` — ${item.message}`);
    lines.push("");
  };

  section("Blocking", errors, "These must be fixed before this can merge.");
  section("Worth a look", warnings, "Not blocking, but a reviewer should read these.");
  section("Notes", notes, "Informational.");

  if (result.newClaims > 0) {
    lines.push(
      "### Reviewer checklist",
      "",
      "- [ ] Each cited source says what the claim says it says.",
      "- [ ] The scope is right — a partial resolution is recorded as partial.",
      "- [ ] A rediscovered published proof is typed `resolved_by_prior_literature`, not `proved`.",
      "- [ ] AI assistance is declared honestly.",
      "",
    );
  }

  fs.writeFileSync(commentPath, lines.join("\n"), "utf8");
  console.log(`\nWrote comment to ${commentPath}`);
}

if (errors.length > 0) {
  console.error(`\n${errors.length} blocking issue(s).`);
  process.exit(1);
}
