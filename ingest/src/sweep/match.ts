import type { Conjecture } from "../types.js";
import type { Candidate, CandidateMatch } from "./types.js";

/**
 * Stage 1: link a candidate to conjectures in the corpus.
 *
 * This is lexical rather than embedding-based on purpose. Downloading an
 * embedding model into every CI run costs more than it buys at this corpus
 * size, and the alias table from Wikidata already solves the hard part -- the
 * Collatz conjecture is also called 3n+1, Ulam, Kakutani, Thwaites, Syracuse
 * and hailstone, and a name index that knows all six beats a vector search that
 * knows none of them. The `Matcher` interface leaves room for an embedding
 * backend if recall ever becomes the bottleneck.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "of", "on", "in", "for", "and", "or", "to", "is", "are", "problem",
  "problems", "conjecture", "conjectures", "hypothesis", "theorem", "lemma", "question",
  "open", "erdos", "number", "set", "sets", "function", "functions", "group", "groups",
  "graph", "graphs", "prime", "primes", "sum", "sums", "s", "with", "by", "from", "at",
]);

/** Titles too generic to match on directly; handled by explicit patterns instead. */
const GENERIC_TITLE = /^erd[oő]s problem \d+$/i;

function normalize(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(input: string): string[] {
  return normalize(input).split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

interface NameEntry {
  id: string;
  title: string;
  name: string;
  normalized: string;
}

export class Matcher {
  #entries: NameEntry[] = [];
  #byToken = new Map<string, number[]>();
  #erdosById = new Map<string, string>();

  constructor(corpus: Conjecture[]) {
    for (const conjecture of corpus) {
      if (conjecture.ids?.erdos) {
        this.#erdosById.set(conjecture.ids.erdos, conjecture.id);
      }

      const names = [conjecture.title, ...(conjecture.aliases ?? [])];
      for (const name of names) {
        if (GENERIC_TITLE.test(name)) continue;
        const normalized = normalize(name);
        // Very short names produce false positives against ordinary prose.
        if (normalized.length < 8) continue;

        const index = this.#entries.length;
        this.#entries.push({ id: conjecture.id, title: conjecture.title, name, normalized });

        for (const token of new Set(tokens(name))) {
          const bucket = this.#byToken.get(token);
          if (bucket) bucket.push(index);
          else this.#byToken.set(token, [index]);
        }
      }
    }

    // Tokens shared by very many names carry no signal and would force us to
    // scan most of the corpus for every candidate.
    for (const [token, bucket] of this.#byToken) {
      if (bucket.length > 40) this.#byToken.delete(token);
    }
  }

  get size(): number {
    return this.#entries.length;
  }

  match(candidate: Candidate): CandidateMatch[] {
    const raw = `${candidate.title}\n${candidate.text}`;
    const haystack = normalize(raw);
    const found = new Map<string, CandidateMatch>();

    // Explicit Erdős problem references: "Erdos problem 728", "Erdős #728".
    for (const m of raw.matchAll(/erd[oő]s(?:'s)?\s*(?:problem|prob\.?|#)\s*#?\s*(\d{1,4})/gi)) {
      const number = m[1]!;
      const id = this.#erdosById.get(number);
      if (!id) continue;
      found.set(id, {
        candidate,
        conjectureId: id,
        conjectureTitle: `Erdős Problem ${number}`,
        matchedOn: m[0],
        matchScore: 0.95,
      });
    }

    // Candidate name entries are limited to those sharing a distinctive token.
    const considered = new Set<number>();
    for (const token of new Set(tokens(raw))) {
      for (const index of this.#byToken.get(token) ?? []) considered.add(index);
    }

    for (const index of considered) {
      const entry = this.#entries[index]!;
      if (!haystack.includes(entry.normalized)) continue;

      // Longer names matching are far less likely to be coincidental.
      const score = Math.min(0.94, 0.55 + entry.normalized.length / 90);
      const existing = found.get(entry.id);
      if (!existing || existing.matchScore < score) {
        found.set(entry.id, {
          candidate,
          conjectureId: entry.id,
          conjectureTitle: entry.title,
          matchedOn: entry.name,
          matchScore: score,
        });
      }
    }

    return [...found.values()].sort((a, b) => b.matchScore - a.matchScore);
  }
}
