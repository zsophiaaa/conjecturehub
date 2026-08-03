import { fetchJson } from "../lib/http.js";

/**
 * Ingests Wikidata as an identity layer, not as a corpus.
 *
 * There are only a few hundred conjecture items on Wikidata, so this will never
 * be a volume source. What it provides is stable QIDs and, crucially, aliases:
 * the Collatz conjecture alone is also called 3n+1, Ulam, Kakutani, Thwaites,
 * Hasse's algorithm, Syracuse and hailstone. Without an alias table, matching
 * incoming claims against the corpus fails on any name we did not anticipate.
 *
 * Wikidata content is CC0.
 */

export const ENDPOINT = "https://query.wikidata.org/sparql";
export const LICENSE = "CC0-1.0";

/**
 * Q319141 is "conjecture"; the property path picks up subclasses too.
 *
 * `wikipedias` counts the Wikipedia language editions carrying a dedicated
 * article, which is the closest thing to an objective measure of how widely
 * known a problem is that can be computed rather than judged. Goldbach scores
 * 58, Riemann 57, and the long tail of specialist conjectures scores zero. It
 * deliberately does not attempt to say how *important* a problem is: that would
 * be an opinion, and every other field in the corpus can name a source.
 *
 * Counting only *.wikipedia.org rather than reading wikibase:sitelinks matters,
 * because the latter also counts Wikiquote, Wikibooks and Commons.
 */
const QUERY = `
SELECT ?item ?label ?enwiki
       (COUNT(DISTINCT ?wparticle) AS ?wikipedias)
       (GROUP_CONCAT(DISTINCT ?alt; separator="||") AS ?aliases)
       (GROUP_CONCAT(DISTINCT ?mw; separator="||") AS ?mathworld)
WHERE {
  ?item wdt:P31/wdt:P279* wd:Q319141 .
  ?item rdfs:label ?label . FILTER(LANG(?label) = "en")
  OPTIONAL { ?item skos:altLabel ?alt . FILTER(LANG(?alt) = "en") }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  OPTIONAL { ?item wdt:P2812 ?mw . }
  OPTIONAL {
    ?wparticle schema:about ?item ; schema:isPartOf ?wpsite .
    FILTER(STRENDS(STR(?wpsite), ".wikipedia.org/"))
  }
}
GROUP BY ?item ?label ?enwiki
ORDER BY ?item
`;

interface SparqlBinding {
  item: { value: string };
  label: { value: string };
  enwiki?: { value: string };
  aliases?: { value: string };
  mathworld?: { value: string };
  wikipedias?: { value: string };
}

export interface WikidataConjecture {
  qid: string;
  label: string;
  aliases: string[];
  wikipedia: string | null;
  mathworld: string | null;
  /** Wikipedia language editions with a dedicated article. */
  wikipediaLanguageEditions: number;
}

export async function loadAll(): Promise<WikidataConjecture[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(QUERY)}&format=json`;
  const data = await fetchJson<{ results: { bindings: SparqlBinding[] } }>(url, {
    ttl: 86400,
    headers: { accept: "application/sparql-results+json" },
  });

  return data.results.bindings.map((b) => {
    const mw = b.mathworld?.value?.split("||").filter(Boolean)[0] ?? null;
    return {
      qid: b.item.value.replace("http://www.wikidata.org/entity/", ""),
      label: b.label.value,
      aliases: (b.aliases?.value ?? "").split("||").filter(Boolean),
      wikipedia: b.enwiki?.value ?? null,
      mathworld: mw ? `https://mathworld.wolfram.com/${mw}.html` : null,
      wikipediaLanguageEditions: Number(b.wikipedias?.value ?? 0) || 0,
    };
  });
}
