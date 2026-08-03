import type { MetadataRoute } from "next";
import { getCorpus, SITE } from "@/lib/corpus";

/**
 * Every conjecture, plus the handful of standing pages.
 *
 * Worth having because almost the entire site is one route with 1,771 static
 * instances, reachable only through a client-filtered index. A crawler that
 * cannot execute that filter sees a nearly empty catalogue.
 *
 * lastModified is the newest date on the record rather than the build time,
 * which would mark all 1,771 pages as changed on every deploy and teach
 * crawlers to ignore the field.
 */

/** The most recent date anything on the record was asserted or recorded. */
function lastTouched(claims: { asserted_on?: string | null; recorded_on?: string | null }[]) {
  const dates = claims.flatMap((c) => [c.asserted_on, c.recorded_on]).filter(Boolean) as string[];
  if (dates.length === 0) return undefined;
  const newest = dates.reduce((a, b) => (a > b ? a : b));
  const parsed = new Date(newest);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const standing: MetadataRoute.Sitemap = [
    { url: `${SITE.url}/`, priority: 1 },
    { url: `${SITE.url}/conjectures/`, priority: 0.9 },
    { url: `${SITE.url}/stats/`, priority: 0.6 },
    { url: `${SITE.url}/agents/`, priority: 0.6 },
    { url: `${SITE.url}/activity/`, priority: 0.4 },
    { url: `${SITE.url}/about/`, priority: 0.4 },
    { url: `${SITE.url}/about/credits/`, priority: 0.2 },
    { url: `${SITE.url}/about/privacy/`, priority: 0.2 },
  ];

  const records = getCorpus().map((c) => ({
    url: `${SITE.url}/conjectures/${c.id}/`,
    lastModified: lastTouched(c.claims ?? []),
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...standing, ...records];
}
