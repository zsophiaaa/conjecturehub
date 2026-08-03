import { fetchJson } from "../lib/http.js";

/**
 * VibeMathed, a community-curated record of problems first solved with AI in
 * the loop.
 *
 * We take the slug and nothing else. Their dataset is CC BY 4.0, so copying
 * field values across would be permitted with attribution, and we still do not:
 * a status, a significance score and a verification label are editorial
 * judgements their curators made and stand behind, and re-hosting them here
 * would launder someone else's call into a number that looks like ours. Where
 * the two records disagree a reader should be able to see two projects
 * disagreeing, which needs both to have done the work independently.
 *
 * So this produces links out, and the site credits them for the pointer.
 */

export const NAME = "VibeMathed";
export const SITE = "https://vibemathed.com";
export const DATASET = "https://vibemathed.com/api/dataset";
export const LICENSE = "CC-BY-4.0";

export interface Entry {
  slug: string;
  name: string;
  shortName: string | null;
  /** Set for the numbered Erdős problems, null otherwise. */
  problemNumber: number | null;
}

interface Dataset {
  license?: string;
  generated?: string;
  count?: number;
  problems: Entry[];
}

export function permalink(slug: string): string {
  return `${SITE}/problem/${slug}`;
}

export async function loadAll(): Promise<{ entries: Entry[]; generated: string | null }> {
  const data = await fetchJson<Dataset>(DATASET, { ttl: 21600 });
  return {
    entries: (data.problems ?? []).map((p) => ({
      slug: p.slug,
      name: p.name,
      shortName: p.shortName ?? null,
      problemNumber: p.problemNumber ?? null,
    })),
    generated: data.generated ?? null,
  };
}

/**
 * Titles for comparison. Strips diacritics, case, punctuation and articles so
 * that "Erdős–Straus conjecture" and "The Erdos Straus Conjecture" meet, while
 * keeping every remaining word significant -- dropping the trailing
 * "conjecture" would collide the several distinct problems named after the same
 * mathematician.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, " ")
    .replace(/['\u2018\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the /, "")
    .trim();
}

/**
 * Erdős problem numbers an entry refers to.
 *
 * Slugs come in three shapes: `erdos-180`, `erdos-131-non-dividing-sets`, and
 * `erdos-593-1177-obligatory-triple-systems`, the last of which is one entry
 * covering two numbered problems. Taking every leading numeric segment handles
 * all three and links both of our records in the third case; reading
 * `problemNumber` alone would silently drop the second, and it is null on some
 * entries anyway.
 */
export function erdosNumbers(entry: Entry): string[] {
  const parts = entry.slug.split("-");
  if (parts[0] !== "erdos") return [];
  const numbers: string[] = [];
  for (const part of parts.slice(1)) {
    if (!/^\d+$/.test(part)) break;
    numbers.push(String(Number(part)));
  }
  return numbers;
}
