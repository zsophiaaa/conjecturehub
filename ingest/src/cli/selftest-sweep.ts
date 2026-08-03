import { deTex } from "../sweep/sources.js";

/**
 * Sanity checks for the sweep's parsing of upstream text. Each case is
 * something that reached, or nearly reached, a record in the corpus.
 */

let failures = 0;

function expect(name: string, got: string, want: string) {
  const hit = got === want;
  console.log(`${hit ? "ok  " : "FAIL"}  ${name}${hit ? "" : ` -> got ${got}, want ${want}`}`);
  if (!hit) failures++;
}

// "Fran\c{c}ois Loeser" was written verbatim onto the fundamental lemma record.
expect("cedilla", deTex(String.raw`Fran\c{c}ois Loeser`), "François Loeser");
expect("acute", deTex(String.raw`Endre Szemer\'edi`), "Endre Szemerédi");
expect("double acute", deTex(String.raw`Paul Erd\H{o}s`), "Paul Erdős");
expect("umlaut", deTex(String.raw`Bj\"orn Poonen`), "Björn Poonen");
expect("stroked l in braces", deTex(String.raw`Micha{\l} Nowak`), "Michał Nowak");

// The common case must not be disturbed by any of the above.
expect("plain ASCII is untouched", deTex("Terence Tao"), "Terence Tao");

// A name already in Unicode must survive a second pass unchanged, since the
// sweep re-reads records it has already written.
expect("idempotent on Unicode", deTex("François Loeser"), "François Loeser");

console.log(failures === 0 ? "\nAll sweep self-tests passed." : `\n${failures} sweep self-test(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
