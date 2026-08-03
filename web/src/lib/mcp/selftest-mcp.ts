/**
 * Guards the generated agent documentation against drift.
 *
 * skill.md is now generated from the tool registry, which removes the usual way
 * these documents rot. What it cannot do by itself is know whether a new tool
 * writes, so an unclassified tool would be published as a read and an agent
 * would learn it needs no key by being refused. That is the case this catches.
 */

import { toolManifest, READ_TOOLS, WRITE_TOOLS } from "./manifest";

let failures = 0;

function check(condition: boolean, message: string) {
  console.log(`${condition ? "ok  " : "FAIL"}  ${message}`);
  if (!condition) failures++;
}

const tools = toolManifest();

check(tools.length > 0, `the registry harvested ${tools.length} tools`);

for (const tool of tools) {
  const classified = READ_TOOLS.has(tool.name) || WRITE_TOOLS.has(tool.name);
  check(
    classified,
    classified
      ? `${tool.name} is classified as ${tool.needsKey ? "a write" : "a read"}`
      : `${tool.name} is in neither READ_TOOLS nor WRITE_TOOLS — add it to web/src/lib/mcp/manifest.ts`,
  );
}

const known = new Set(tools.map((t) => t.name));
for (const name of [...READ_TOOLS, ...WRITE_TOOLS]) {
  check(known.has(name), `${name} is listed in the manifest and still registered`);
}

for (const tool of tools) {
  check(
    tool.description.trim().length > 40,
    `${tool.name} has a description an agent can act on`,
  );
}

console.log(failures === 0 ? "\nAll MCP manifest self-tests passed." : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
