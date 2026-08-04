/**
 * Applies curator-written replacements for `statement.informal`.
 *
 * Input is a JSON array of verified statements, each carrying the primary
 * source it was checked against:
 *   { id, informal, source, confidence, resolved, resolution_note, notes }
 *
 * Two things this refuses to do silently. It will not apply a statement that
 * shares a long verbatim run with erdosproblems.com, whose prose we link to
 * rather than redistribute (conjectures/LICENSE.md), and it will not change a
 * record's resolution status, which needs a claim and a human.
 *
 *   tsx src/cli/apply-statements.ts <file.json> [--include-low] [--dry-run]
 */
import fs from "node:fs";
import { read, write } from "../lib/conjecture.js";

interface Entry {
  id: string;
  informal: string;
  source: string;
  extra_sources?: string[];
  resolved?: boolean;
  resolution_note?: string | null;
  confidence?: string;
  notes?: string | null;
}

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const includeLow = args.includes("--include-low");
const dryRun = args.includes("--dry-run");

if (!file) {
  console.error("usage: apply-statements.ts <file.json> [--include-low] [--dry-run]");
  process.exit(1);
}

const entries: Entry[] = JSON.parse(fs.readFileSync(file, "utf8"));

/** Longest run of shared words, used to catch prose we may not redistribute. */
const RUN = 12;
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

function sharedRun(a: string, b: string): string | null {
  const wa = words(a);
  const wb = words(b);
  const grams = new Set<string>();
  for (let i = 0; i + RUN <= wb.length; i++) grams.add(wb.slice(i, i + RUN).join(" "));
  for (let i = 0; i + RUN <= wa.length; i++) {
    const g = wa.slice(i, i + RUN).join(" ");
    if (grams.has(g)) return g;
  }
  return null;
}

async function erdosPageText(n: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.erdosproblems.com/${n}`, {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    return html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/g, " ");
  } catch {
    return null;
  }
}

const applied: string[] = [];
const skipped: string[] = [];
const needsStatus: Entry[] = [];

for (const entry of entries) {
  if (entry.confidence === "low" && !includeLow) {
    skipped.push(`${entry.id}: low confidence — ${entry.notes ?? "no note"}`);
    continue;
  }
  if (!entry.informal?.trim()) {
    skipped.push(`${entry.id}: empty statement`);
    continue;
  }

  const erdos = /^erdos-(\d+)$/.exec(entry.id);
  if (erdos) {
    const page = await erdosPageText(erdos[1]!);
    if (page) {
      const run = sharedRun(entry.informal, page);
      if (run) {
        skipped.push(`${entry.id}: shares a ${RUN}-word run with erdosproblems.com — "${run}"`);
        continue;
      }
    } else {
      console.warn(`  ${entry.id}: could not fetch erdosproblems.com to check for copied prose`);
    }
  }

  const record = read(entry.id) as any;
  record.statement.informal = entry.informal.trim();

  for (const p of record.provenance) {
    if (p.source === "google-deepmind/formal-conjectures") {
      p.fields = p.fields.filter((f: string) => f !== "statement.informal");
    }
  }
  record.provenance = record.provenance.filter((p: any) => p.fields.length > 0);

  const existing = record.provenance.find(
    (p: any) => p.source === "conjecturehub-curator" && p.fields.includes("statement.informal"),
  );
  if (existing) existing.url = entry.source;
  else
    record.provenance.push({
      url: entry.source,
      source: "conjecturehub-curator",
      fields: ["statement.informal"],
      license: "CC0-1.0",
      retrieved: new Date().toISOString().slice(0, 10),
    });

  if (!dryRun) write(record);
  applied.push(entry.id);
  if (entry.resolved) needsStatus.push(entry);
}

console.log(`${dryRun ? "would apply" : "applied"}: ${applied.length}`);
for (const id of applied) console.log(`  ${id}`);

console.log(`\nskipped: ${skipped.length}`);
for (const s of skipped) console.log(`  ${s}`);

console.log(`\nreported as resolved — status is a separate, human decision: ${needsStatus.length}`);
for (const e of needsStatus) console.log(`  ${e.id}: ${e.resolution_note ?? "(no note)"}`);
