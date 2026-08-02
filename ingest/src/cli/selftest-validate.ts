import { validateConjecture } from "../lib/validate.js";
import type { Conjecture } from "../types.js";

/**
 * Sanity checks for the semantic rules, which are easy to write in a way that
 * passes on every real record while catching nothing. Each case below is a bug
 * that actually reached the corpus.
 */

function claim(over: Record<string, unknown>) {
  return {
    id: "x-a",
    type: "proved",
    evidence_tier: "published",
    state: "active",
    recorded_on: "2026-08-02",
    reviewer: "someone",
    source: { kind: "dataset", url: "https://example.com/a" },
    ...over,
  };
}

function record(claims: unknown[]): unknown {
  return {
    id: "x",
    title: "X",
    ids: {},
    openness_basis: { meaning: "unknown" },
    provenance: [
      {
        fields: ["claims"],
        source: "selftest",
        license: "CC0-1.0",
        retrieved: "2026-08-02",
      },
    ],
    claims,
  } as unknown as Conjecture;
}

let failures = 0;

function expect(name: string, value: unknown, shouldMatch: RegExp | null) {
  const messages = validateConjecture(value).map((i) => i.message);
  const hit = shouldMatch ? messages.some((m) => shouldMatch.test(m)) : messages.length === 0;
  console.log(`${hit ? "ok  " : "FAIL"}  ${name}${hit ? "" : ` -> ${JSON.stringify(messages)}`}`);
  if (!hit) failures++;
}

// Erdos 90 displayed as "Proved" while being publicly disproved.
expect(
  "unscoped proved + disproved is rejected",
  record([claim({ id: "x-a" }), claim({ id: "x-b", type: "disproved" })]),
  /contradict each other/,
);

// The Jacobian conjecture really is false for n >= 3 and open for n = 2.
expect(
  "the same pair with a scope is allowed",
  record([claim({ id: "x-a" }), claim({ id: "x-b", type: "disproved", scope: "n >= 3" })]),
  null,
);

// A machine_verified claim pinned to a branch is not reproducible.
expect(
  "machine_verified on a moving branch is rejected",
  record([
    claim({
      evidence_tier: "machine_verified",
      reviewer: null,
      source: { kind: "dataset", url: "https://github.com/o/r/blob/main/F.lean" },
      verification: {
        tool: "lean4",
        statement_path: "F.lean",
        theorem: "t",
        toolchain: "x",
        permitted_axioms: ["propext"],
        verified_on: "2026-08-02",
      },
    }),
  ]),
  /immutable ref/,
);

console.log(failures === 0 ? "\nAll self-tests passed." : `\n${failures} self-test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
