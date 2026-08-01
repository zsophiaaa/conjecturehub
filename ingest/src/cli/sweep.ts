import fs from "node:fs";
import path from "node:path";
import { runSweep, type Proposal, type SweepReport } from "../sweep/run.js";

/**
 * Runs the sweep and, when asked, writes the artifacts the workflow needs to
 * open a pull request.
 *
 *   --write             append claims to conjecture files
 *   --budget N          cap classifier calls this run
 *   --window N          only consider items from the last N days
 *   --pr-body PATH      write the pull request description
 *   --report PATH       write the full JSON report
 */

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const budgetArg = option("budget");
const windowArg = option("window");
const report = await runSweep({
  write: flag("write"),
  budget: budgetArg ? Number(budgetArg) : undefined,
  windowDays: windowArg ? Number(windowArg) : undefined,
});

console.log(`Sweep at ${report.startedAt}`);
console.log(`  classifier: ${report.provider}`);
for (const source of report.sourceSummary) {
  console.log(`  ${source.origin.padEnd(28)} ${String(source.count).padStart(4)}${source.error ? `  FAILED: ${source.error}` : ""}`);
}
console.log(
  `  fetched ${report.fetched} -> ${report.afterWindow} in window -> ${report.afterDedupe} new -> ${report.afterPrefilter} past prefilter -> ${report.matched} matched to a conjecture`,
);
console.log(`  classifier calls: ${report.classifierCalls} (${report.classifierSkipped} skipped)`);
console.log(`  proposals: ${report.proposals.length} (${report.proposals.filter((p) => p.written).length} written)`);
console.log(`  needing human triage: ${report.needsTriage.length}`);

for (const proposal of report.proposals.slice(0, 20)) {
  console.log(
    `    ${proposal.written ? "+" : " "} ${proposal.confidence.toFixed(2)} ${proposal.conjectureId} <- ${proposal.claim.type} via ${proposal.origin}`,
  );
}

for (const item of report.needsTriage.slice(0, 20)) {
  console.log(`    ? ${item.matchScore.toFixed(2)} ${item.conjectureId} <- "${item.matchedOn}" via ${item.origin}`);
}

function renderProposal(proposal: Proposal): string {
  const claim = proposal.claim;
  return [
    `### ${proposal.conjectureTitle}`,
    "",
    `\`conjectures/${proposal.conjectureId}.yaml\``,
    "",
    `| | |`,
    `| --- | --- |`,
    `| Claim type | \`${claim.type}\` |`,
    `| Scope | ${claim.scope ?? "_whole conjecture_"} |`,
    `| Evidence tier | \`unverified_claim\` — nobody has checked this |`,
    `| Source | [${(claim.source.title ?? claim.source.url).slice(0, 120)}](${claim.source.url}) (${claim.source.kind}) |`,
    `| Asserted | ${claim.asserted_on ?? "unknown"} |`,
    `| Classifier confidence | ${proposal.confidence.toFixed(2)} (${proposal.classifier}) |`,
    "",
    claim.source.quote ? `> ${claim.source.quote}\n` : "",
    proposal.rationale ? `Classifier rationale: ${proposal.rationale}\n` : "",
  ].join("\n");
}

function renderPrBody(report: SweepReport): string {
  const written = report.proposals.filter((p) => p.written);
  const flagged = report.proposals.filter((p) => !p.written);

  const lines = [
    `## Sweep results — ${report.startedAt.slice(0, 10)}`,
    "",
    "This pull request was opened automatically. It **does not change any conjecture's status**: it appends claims at the `unverified_claim` tier, which means someone somewhere asserted something and nobody has checked it.",
    "",
    "**Merging this is the review step.** Before you do, for each claim below:",
    "",
    "- [ ] Follow the source link and confirm it says what the claim says.",
    "- [ ] Confirm it is about *this* conjecture and not a similarly-named one.",
    "- [ ] Check the scope. A resolution in some cases is not a resolution.",
    "- [ ] Ask whether this is a new result or the rediscovery of a published one. If the latter, change the type to `resolved_by_prior_literature` before merging.",
    "",
    "Close this pull request to reject everything in it. Delete individual entries to reject them one at a time.",
    "",
    "---",
    "",
  ];

  if (written.length > 0) {
    lines.push(`## ${written.length} claim(s) added`, "");
    for (const proposal of written) lines.push(renderProposal(proposal), "");
  } else {
    lines.push("_No claims cleared the confidence threshold this run._", "");
  }

  if (flagged.length > 0) {
    lines.push(
      "---",
      "",
      `## ${flagged.length} match(es) below threshold, not written`,
      "",
      "These were found but not recorded. Listed so a human can look if they want to.",
      "",
      "| Conjecture | Type | Confidence | Source |",
      "| --- | --- | --- | --- |",
    );
    for (const proposal of flagged.slice(0, 40)) {
      lines.push(
        `| \`${proposal.conjectureId}\` | ${proposal.claim.type} | ${proposal.confidence.toFixed(2)} | [${proposal.origin}](${proposal.claim.source.url}) |`,
      );
    }
    lines.push("");
  }

  if (report.needsTriage.length > 0) {
    lines.push(
      "---",
      "",
      `## ${report.needsTriage.length} match(es) never classified`,
      "",
      "The classifier was unavailable or out of budget, so these were matched by name and left alone. Nothing was written for them.",
      "",
      "| Conjecture | Matched on | Source |",
      "| --- | --- | --- |",
      ...report.needsTriage
        .slice(0, 40)
        .map(
          (item) =>
            `| \`${item.conjectureId}\` | ${item.matchedOn} | [${item.title.slice(0, 80)}](${item.url}) |`,
        ),
      "",
    );
  }

  lines.push(
    "---",
    "",
    "<details><summary>Run details</summary>",
    "",
    `- Classifier: \`${report.provider}\`, ${report.classifierCalls} call(s), ${report.classifierSkipped} skipped for budget`,
    `- Pipeline: ${report.fetched} fetched → ${report.afterDedupe} new → ${report.afterPrefilter} past prefilter → ${report.matched} matched`,
    "",
    "| Source | Items |",
    "| --- | --- |",
    ...report.sourceSummary.map((s) => `| ${s.origin} | ${s.error ? `failed: ${s.error}` : s.count} |`),
    "",
    "</details>",
  );

  return lines.join("\n");
}

const prBodyPath = option("pr-body");
if (prBodyPath) {
  fs.mkdirSync(path.dirname(path.resolve(prBodyPath)), { recursive: true });
  fs.writeFileSync(prBodyPath, renderPrBody(report), "utf8");
  console.log(`\nWrote pull request body to ${prBodyPath}`);
}

const reportPath = option("report");
if (reportPath) {
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`Wrote report to ${reportPath}`);
}

// The workflow only opens a pull request when something was written.
if (process.env.GITHUB_OUTPUT) {
  const written = report.proposals.filter((p) => p.written).length;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `written=${written}\nproposals=${report.proposals.length}\n`,
  );
}
