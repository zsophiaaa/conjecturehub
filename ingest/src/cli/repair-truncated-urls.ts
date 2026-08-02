import { listIds, read, write } from "../lib/conjecture.js";
import { fetchText } from "../lib/http.js";

/**
 * Repairs URLs that were truncated at an inner parenthesis on ingest.
 *
 * The markdown-link regex in `sources/formal-conjectures.ts` used to capture
 * `[^)\s]+`, so it stopped at the first `)` inside a URL. Wikipedia
 * disambiguation links and old Wiley `10.1002/(SICI)...` DOIs both lose text
 * that way, and the result still looks like a plausible URL, which is the worst
 * kind of broken citation.
 *
 * The lost text cannot be reconstructed by appending a bracket, so this refetches
 * the upstream Lean file recorded in `provenance` and re-extracts the link with
 * the corrected pattern. A replacement is only accepted when the recovered URL
 * starts with the truncated one, so a mismatch leaves the record alone.
 *
 *   --dry-run   report what would change and write nothing
 */

const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/g;

const dryRun = process.argv.includes("--dry-run");

function unbalanced(url: string): boolean {
  return (url.match(/\(/g) ?? []).length > (url.match(/\)/g) ?? []).length;
}

function rawUrl(blobUrl: string): string | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(blobUrl);
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` : null;
}

let repaired = 0;
let unresolved = 0;

for (const id of listIds()) {
  const record = read(id);
  const ids = record.ids ?? {};

  const targets = [
    ...(ids.external ?? []).map((e, i) => ({ get: () => e.url, set: (v: string) => (e.url = v), where: `ids.external[${i}]` })),
    ...(ids.wikipedia && unbalanced(ids.wikipedia)
      ? [{ get: () => ids.wikipedia!, set: (v: string) => (ids.wikipedia = v), where: "ids.wikipedia" }]
      : []),
    ...(ids.mathworld && unbalanced(ids.mathworld)
      ? [{ get: () => ids.mathworld!, set: (v: string) => (ids.mathworld = v), where: "ids.mathworld" }]
      : []),
  ].filter((t) => unbalanced(t.get()));

  if (targets.length === 0) continue;

  const upstream = (record.provenance ?? []).find(
    (p) => p.source === "google-deepmind/formal-conjectures" && p.url,
  );
  const raw = upstream?.url ? rawUrl(upstream.url) : null;
  if (!raw) {
    console.log(`${id}: ${targets.length} truncated URL(s) but no upstream source to re-read`);
    unresolved += targets.length;
    continue;
  }

  let source: string;
  try {
    source = await fetchText(raw, { ttl: 86400 });
  } catch (error) {
    console.error(`${id}: could not fetch ${raw} (${(error as Error).message})`);
    unresolved += targets.length;
    continue;
  }

  const recovered = [...source.matchAll(MARKDOWN_LINK)].map((m) => m[2]!);
  let touched = false;

  for (const target of targets) {
    const truncated = target.get();
    const full = recovered.find((u) => u.startsWith(truncated) && u.length > truncated.length);
    if (!full) {
      console.log(`${id} ${target.where}: no upstream match for ${truncated}`);
      unresolved++;
      continue;
    }
    console.log(`${id} ${target.where}:\n    ${truncated}\n -> ${full}`);
    target.set(full);
    touched = true;
    repaired++;
  }

  if (touched && !dryRun) write(record);
}

console.log(
  `\n${dryRun ? "Would repair" : "Repaired"} ${repaired} URL(s); ${unresolved} left unresolved.`,
);
