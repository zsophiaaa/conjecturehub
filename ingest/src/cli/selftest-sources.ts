/**
 * Self-tests for upstream source parsing.
 *
 * The statement a record displays is the docstring of whichever declaration
 * `primaryDeclaration` picks, so a wrong pick silently publishes the wrong
 * mathematics. These cases pin the two ways that has gone wrong.
 */
import { primaryDeclaration, type FcDeclaration, type FcFile } from "../sources/formal-conjectures.js";

let failures = 0;

function decl(name: string, category: string): FcDeclaration {
  return { name, category, ams: [], doc: name, statement: "", isVariant: name.includes(".variants.") };
}

function file(...declarations: FcDeclaration[]): FcFile {
  return { path: "test.lean", title: "test", references: [], declarations };
}

function expect(label: string, actual: string | null, want: string) {
  if (actual === want) {
    console.log(`ok    ${label}`);
    return;
  }
  console.error(`FAIL  ${label}\n        want ${want}\n        got  ${actual}`);
  failures += 1;
}

const pick = (f: FcFile) => primaryDeclaration(f)?.name ?? null;

expect(
  "prefers the open statement over a solved one",
  pick(file(decl("beck_fiala_theorem", "research solved"), decl("beck_fiala_conjecture", "research open"))),
  "beck_fiala_conjecture",
);

expect(
  "skips .variants. siblings",
  pick(file(decl("erdos_812", "research open"), decl("erdos_812.variants.part_i", "research open"))),
  "erdos_812",
);

// green_19.lower is a partial bound tagged open, sitting beside a headline that
// records the problem as resolved. Leading with it published "[Ma21] showed
// that 3.13 <= C." as the statement of a solved problem.
expect(
  "a dotted sibling never outranks its own base, even when the base is solved",
  pick(file(decl("green_19", "research solved"), decl("green_19.lower", "research open"))),
  "green_19",
);

// oppermann_conjecture.parts.i is half of a two-part conjecture and is declared
// before the combined statement, so document order alone chose the fragment.
expect(
  "a dotted sibling never outranks its own base, whatever the order",
  pick(
    file(
      decl("oppermann_conjecture.parts.i", "research open"),
      decl("oppermann_conjecture.parts.ii", "research open"),
      decl("oppermann_conjecture", "research open"),
    ),
  ),
  "oppermann_conjecture",
);

// Subordination is only meaningful relative to a base that exists. Namespaced
// declarations standing alone must still be eligible.
expect(
  "a dotted name with no base in the file is still eligible",
  pick(file(decl("Finite.Equation677_not_implies_Equation255", "research open"))),
  "Finite.Equation677_not_implies_Equation255",
);

if (failures > 0) {
  console.error(`\n${failures} source self-test(s) failed.`);
  process.exit(1);
}
console.log("\nAll source self-tests passed.");
