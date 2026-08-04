/**
 * Detects prose we may not redistribute.
 *
 * Some upstream statements have to be rewritten by a curator, and the obvious
 * way to write one is with the original page open. erdosproblems.com prose we
 * link to rather than copy (conjectures/LICENSE.md), so a replacement needs
 * checking against its source before it lands.
 *
 * Comparison is on prose only. Two correct statements of the same definition
 * contain the same formula, and stripping the mathematics out leaves mostly
 * connective tissue -- "for integers let denote the minimal such that there
 * exist integers with" -- which independent authors collide on because the
 * mathematics allows few other phrasings. So a short run must carry content
 * words to count, while a long one is damning whatever it is made of.
 */

const RUN = 12;
const LONG_RUN = 20;

/**
 * Content words needed before a short run counts. Calibrated against real
 * cases: at 4 a near-verbatim paragraph from erdosproblems.com is caught while
 * sixteen independently written statements and a loose paraphrase pass. Raising
 * it to 6 let a copied paragraph through, so treat this as a floor.
 */
const DISTINCTIVE_NEEDED = 4;

const COMMON = new Set(
  `a an and any are as at be been by can constant constants denote denotes distinct do does
   each every exist exists for from greater greatest has have if in integer integers is it its
   largest least let many maximal minimal most must no not number numbers of on one or positive
   prove real sequence set sets show smallest so some sum such that the then there this to true
   two we were what when where which with within`.split(/\s+/),
);

export function proseWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** The shared run that suggests copying, or null when the prose is the author's own. */
export function sharedRun(candidate: string, source: string): string | null {
  const wa = proseWords(candidate);
  const wb = proseWords(source);

  const runsOf = (n: number, w: string[]) => {
    const out = new Set<string>();
    for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
    return out;
  };

  const long = runsOf(LONG_RUN, wb);
  for (const g of runsOf(LONG_RUN, wa)) if (long.has(g)) return g;

  const short = runsOf(RUN, wb);
  for (const g of runsOf(RUN, wa)) {
    if (!short.has(g)) continue;
    const distinctive = g.split(" ").filter((w) => !COMMON.has(w));
    if (distinctive.length >= DISTINCTIVE_NEEDED) return g;
  }
  return null;
}
