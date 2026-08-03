import { readAll, serialize, conjecturePath } from "../lib/conjecture.js";
import fs from "node:fs";

/**
 * Rewrites every record through the canonical serializer.
 *
 * Needed whenever the serializer itself changes, since normal writes only touch
 * records whose content changed and the corpus would otherwise drift into two
 * formats. Content is untouched: a file is written only if its rendering
 * differs, so a run on an already-clean corpus is a no-op.
 *
 *   --check   exit non-zero if anything would change, and write nothing
 */

const check = process.argv.includes("--check");

const records = readAll();
const changed: string[] = [];

for (const record of records) {
  const file = conjecturePath(record.id);
  const next = serialize(record);
  if (fs.readFileSync(file, "utf8") === next) continue;
  changed.push(record.id);
  if (!check) fs.writeFileSync(file, next, "utf8");
}

if (changed.length === 0) {
  console.log(`OK — all ${records.length} records already match the canonical format.`);
  process.exit(0);
}

if (check) {
  console.error(`${changed.length} of ${records.length} record(s) are not canonically formatted:`);
  for (const id of changed.slice(0, 20)) console.error(`  ${id}`);
  if (changed.length > 20) console.error(`  ...and ${changed.length - 20} more`);
  console.error("Run `npm run format` to fix.");
  process.exit(1);
}

console.log(`Reformatted ${changed.length} of ${records.length} record(s).`);
