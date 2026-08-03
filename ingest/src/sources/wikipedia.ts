import { fetchJson } from "../lib/http.js";

/**
 * English Wikipedia category membership, used as a status signal.
 *
 * Wikipedia prose is CC BY-SA, which is share-alike and does not match the
 * permissive licensing the rest of the corpus carries, so nothing here copies
 * article text. Category membership is a structural fact about the article
 * rather than an expression of it, and it is what a reader would check first
 * anyway: "Conjectures that have been proved" is a claim the encyclopedia makes
 * in a form we can read without paraphrasing anyone.
 */

export const LICENSE = "CC-BY-SA-4.0";

/** The MediaWiki API caps an anonymous multi-title query at 50. */
const BATCH = 50;

export type StatusSignal = "proved" | "disproved" | "open";

/**
 * Categories we are willing to read a status out of. Everything else is
 * subject matter ("Category:Analytic number theory") and says nothing about
 * whether the problem is settled.
 *
 * Deliberately narrow. "Category:Theorems in number theory" appears on articles
 * that state a conjecture and a related theorem, so it cannot be read as the
 * conjecture itself being proved.
 */
const EXACT: Record<string, StatusSignal> = {
  "Category:Conjectures that have been proved": "proved",
  "Category:Disproved conjectures": "disproved",
};

const OPEN_PREFIX = "Category:Unsolved problems in ";

export interface CategoryResult {
  /** The article title after redirect and normalisation, for citing what we read. */
  title: string;
  categories: string[];
  signal: StatusSignal | null;
  /** Set when the article is in categories implying more than one status. */
  conflict: string[] | null;
}

interface ApiResponse {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: Record<string, { title: string; missing?: string; categories?: { title: string }[] }>;
  };
}

export function classify(categories: string[]): Pick<CategoryResult, "signal" | "conflict"> {
  const signals = new Map<StatusSignal, string[]>();
  for (const category of categories) {
    const exact = EXACT[category];
    const signal = exact ?? (category.startsWith(OPEN_PREFIX) ? ("open" as const) : null);
    if (!signal) continue;
    signals.set(signal, [...(signals.get(signal) ?? []), category]);
  }

  if (signals.size === 0) return { signal: null, conflict: null };
  if (signals.size > 1) {
    // Articles that were open, got resolved, and kept both categories. A human
    // has to read those; guessing which category is stale is how a resolved
    // problem gets published as open or the reverse.
    return { signal: null, conflict: [...signals.values()].flat() };
  }
  const [only] = [...signals.keys()];
  return { signal: only!, conflict: null };
}

/** Maps each requested title to its categories, following redirects. */
export async function fetchCategories(titles: string[]): Promise<Map<string, CategoryResult>> {
  const out = new Map<string, CategoryResult>();

  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "1");
    url.searchParams.set("prop", "categories");
    url.searchParams.set("cllimit", "max");
    url.searchParams.set("clshow", "!hidden");
    url.searchParams.set("redirects", "1");
    url.searchParams.set("titles", batch.join("|"));

    const data = await fetchJson<ApiResponse>(url.toString(), { ttl: 86400 });

    // The API answers under the resolved title, so walk the normalisation and
    // redirect tables back to the title we asked about.
    const resolved = new Map<string, string>(batch.map((t) => [t, t]));
    for (const table of [data.query?.normalized ?? [], data.query?.redirects ?? []]) {
      for (const [asked, current] of resolved) {
        const hop = table.find((r) => r.from === current);
        if (hop) resolved.set(asked, hop.to);
      }
    }

    const pages = Object.values(data.query?.pages ?? {});
    for (const [asked, final] of resolved) {
      const page = pages.find((p) => p.title === final);
      if (!page || page.missing !== undefined) continue;
      const categories = (page.categories ?? []).map((c) => c.title);
      out.set(asked, { title: page.title, categories, ...classify(categories) });
    }
  }

  return out;
}
