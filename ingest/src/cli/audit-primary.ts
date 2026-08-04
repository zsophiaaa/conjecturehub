/**
 * Audits which records lead with a subordinate Lean declaration.
 *
 * Upstream names the headline statement after the problem (`green_19`) and
 * hangs everything else off it (`green_19.lower`, `erdos_812.variants.parts_i`).
 * `primaryDeclaration` only treated `.variants.` as subordinate, so a dotted
 * sibling tagged `research open` could outrank the headline and become the
 * displayed statement. Reports every file where the two disagree.
 */
import fs from "node:fs";
import path from "node:path";
import * as fc from "../sources/formal-conjectures.js";
import { primaryDeclaration } from "../sources/formal-conjectures.js";
import { read } from "../lib/conjecture.js";
import { REPO_ROOT } from "../lib/paths.js";

const CONJECTURES = path.join(REPO_ROOT, "conjectures");

/**
 * Only a declaration's own base counts as its headline. Upstream also uses
 * undotted sibling names for warm-up results (`beck_fiala_theorem` next to
 * `beck_fiala_conjecture`), and there the open one is genuinely what we want,
 * so comparing against "first undotted declaration" produces false positives.
 */
function headline(file: fc.FcFile, chosen: fc.FcDeclaration): fc.FcDeclaration | null {
  if (!chosen.name.includes(".")) return null;
  const base = chosen.name.slice(0, chosen.name.indexOf("."));
  return fc.researchDeclarations(file).find((d) => d.name === base) ?? null;
}

const { tag, files } = await fc.loadAll();

const rows: { path: string; chose: string; should: string; category: string; doc: string }[] = [];
for (const file of files) {
  const chosen = fc.primaryDeclaration(file);
  if (!chosen) continue;
  const head = headline(file, chosen);
  if (!head) continue;
  rows.push({
    path: file.path,
    chose: chosen.name,
    should: head.name,
    category: head.category,
    doc: (chosen.doc ?? "").replace(/\s+/g, " ").slice(0, 90),
  });
}

console.log(`upstream ${tag}: ${files.length} files, ${rows.length} lead with a subordinate declaration\n`);

const byCategory = new Map<string, number>();
for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
for (const [cat, n] of [...byCategory].sort((a, b) => b[1] - a[1])) {
  console.log(`  headline is "${cat}": ${n}`);
}

console.log();
for (const r of rows.slice(0, 25)) {
  console.log(`${r.path}\n  chose ${r.chose}  (headline ${r.should}, ${r.category})\n  "${r.doc}"`);
}

/**
 * Curator edits to an ingested statement are legitimate, but the provenance
 * has to stop saying the text came from upstream, or per-field attribution is
 * decorative. Reports records whose statement no longer matches upstream while
 * still crediting upstream for `statement.informal`.
 */
const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// Any prose in the upstream file counts as upstream, not just the declaration
// we happen to lead with: a correction often means swapping in the module
// docstring or a sibling's, which leaves the attribution accurate.
const upstreamProse = new Map<string, Set<string>>();
for (const file of files) {
  const texts = [file.moduleDoc, ...file.declarations.map((d) => d.doc)].map(norm).filter(Boolean);
  upstreamProse.set(file.path, new Set(texts));
}

const drifted: string[] = [];
const empty: string[] = [];
for (const rel of fs.readdirSync(CONJECTURES).filter((f) => f.endsWith(".yaml"))) {
  const record = read(rel.replace(/\.yaml$/, "")) as {
    statement: { informal: string | null };
    ids?: { formal_conjectures?: string | null };
    provenance: { source: string; fields: string[] }[];
  };
  const fcPath = record.ids?.formal_conjectures;
  if (!fcPath || !upstreamProse.has(fcPath)) continue;

  const claimsUpstream = record.provenance.some(
    (p) => p.source === "google-deepmind/formal-conjectures" && p.fields.includes("statement.informal"),
  );
  if (!claimsUpstream) continue;

  const id = rel.replace(/\.yaml$/, "");
  const text = norm(record.statement.informal);
  // An empty statement is a gap, not a misattribution: upstream simply left
  // the declaration undocumented. Worth reporting, but it is a different fix.
  if (!text) empty.push(id);
  else if (!upstreamProse.get(fcPath)!.has(text)) drifted.push(id);
}

console.log(`\n${drifted.length} record(s) credit formal-conjectures for text it did not write:`);
for (const id of drifted) console.log(`  ${id}`);

console.log(`\n${empty.length} record(s) credit formal-conjectures for an empty statement:`);
for (const id of empty) console.log(`  ${id}`);
