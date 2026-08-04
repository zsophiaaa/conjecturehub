/**
 * Self-tests for upstream source parsing.
 *
 * The statement a record displays is the docstring of whichever declaration
 * `primaryDeclaration` picks, so a wrong pick silently publishes the wrong
 * mathematics. These cases pin the two ways that has gone wrong.
 */
import { primaryDeclaration, type FcDeclaration, type FcFile } from "../sources/formal-conjectures.js";
import { sharedRun } from "../lib/overlap.js";

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


// --- Copied-prose detection -------------------------------------------------
// erdosproblems.com prose is linked, not redistributed, so a curator-written
// replacement gets checked against its source. These pin the calibration: the
// threshold was loosened three times while chasing false positives and at one
// point stopped catching a copied paragraph.

const SOURCE_PAGE = `Erdős proved that log log b << N(b) << log b / log log b.
The upper bound was improved by Vose to N(b) << sqrt(log b). One can also
investigate the average of $N(a,b)$ for fixed $b$, and it is known that the
average is at least a constant times log log b. Related to [18]. There is also
a close connection to [293] (particularly with $N(b-1,b)$), as elucidated by
van Doorn and Tang.`;

function expectRun(label: string, candidate: string, wantCaught: boolean) {
  const caught = sharedRun(candidate, SOURCE_PAGE) !== null;
  if (caught === wantCaught) {
    console.log(`ok    ${label}`);
    return;
  }
  console.error(`FAIL  ${label}\n        expected ${wantCaught ? "caught" : "allowed"}, got ${caught ? "caught" : "allowed"}`);
  failures += 1;
}

expectRun(
  "catches a near-verbatim paragraph",
  `One can also investigate the average of $N(a,b)$ for fixed $b$, and it is known
   that the average is at least a constant times $\\log\\log b$. There is also a close
   connection to problem 293, particularly with $N(b-1,b)$, as elucidated by van Doorn and Tang.`,
  true,
);

expectRun(
  "allows an independently written definition",
  `For integers $1 \\leq a < b$ let $N(a,b)$ denote the minimal $k$ such that there exist
   integers $1 < n_1 < \\cdots < n_k$ with $$\\frac{a}{b} = \\frac{1}{n_1} + \\cdots + \\frac{1}{n_k},$$
   and let $N(b) = \\max_{1\\leq a<b} N(a,b)$. Estimate $N(b)$.`,
  false,
);

expectRun(
  "allows a loose paraphrase in the author's own words",
  `Erdős proved that the density always exists and satisfies bounds. Do there exist
   constants such that the density is asymptotic to a power of a logarithm?`,
  false,
);

expectRun(
  "identical formulae alone are not evidence",
  `$$\\log\\log b \\ll N(b) \\ll \\frac{\\log b}{\\log\\log b}$$`,
  false,
);

if (failures > 0) {
  console.error(`\n${failures} source self-test(s) failed.`);
  process.exit(1);
}
console.log("\nAll source self-tests passed.");
