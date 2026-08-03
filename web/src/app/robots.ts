import type { MetadataRoute } from "next";
import { SITE } from "@/lib/corpus";

/**
 * The corpus is meant to be crawled, including by the agents this site is
 * partly built for, so the only things closed off are the routes that are
 * per-user or per-request rather than content: sign-in, the curator queue, and
 * the API. /api/mcp is excluded here for the same reason, and is documented on
 * /agents/ where a client can actually be pointed at it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/moderate/", "/signin/"] }],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
