#!/usr/bin/env tsx
/**
 * Adds erdosproblems.com forum thread links to every erdos-*.yaml that has
 * ids.erdos but no forum external link yet. Does not scrape or copy comments —
 * see docs/DISCUSSION-SOURCES.md.
 */
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { CONJECTURES_DIR } from "../lib/paths.js";

interface ExternalLink {
  label: string;
  url: string;
}

interface ConjectureYaml {
  id: string;
  ids?: { erdos?: string; external?: ExternalLink[] };
}

function hasForumLink(links: ExternalLink[] | undefined): boolean {
  return (links ?? []).some(
    (l) => l.url.includes("erdosproblems.com/forum") || l.label.toLowerCase().includes("forum"),
  );
}

function main(): void {
  const dir = CONJECTURES_DIR;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("erdos-") && f.endsWith(".yaml"));
  let added = 0;
  let skipped = 0;

  for (const file of files) {
    const full = path.join(dir, file);
    const doc = parse(fs.readFileSync(full, "utf8")) as ConjectureYaml;
    const num = doc.ids?.erdos;
    if (!num) {
      skipped++;
      continue;
    }
    doc.ids ??= {};
    doc.ids.external ??= [];
    if (hasForumLink(doc.ids.external)) {
      skipped++;
      continue;
    }
    doc.ids.external.push({
      label: `erdosproblems.com forum #${num}`,
      url: `https://www.erdosproblems.com/forum/thread/${num}`,
    });
    fs.writeFileSync(full, stringify(doc, { lineWidth: 0 }));
    added++;
  }

  console.log(`Forum links: added ${added}, already present or skipped ${skipped} (${files.length} erdos files).`);
}

main();
