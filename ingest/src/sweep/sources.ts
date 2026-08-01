import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { fetchJson, fetchText } from "../lib/http.js";
import type { Candidate } from "./types.js";

/**
 * Every source here is free and permits automated access. X is deliberately
 * absent: since February 2026 there is no free read tier, reads are billed per
 * post, and scraping is both a permanent-ban offense under X's developer terms
 * and the subject of live CFAA litigation. In practice a claim announced on X
 * reaches arXiv, Hacker News, Mathstodon and the blogs within hours, and those
 * secondary reports cite the original post, which is what we record.
 */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

function hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 16);
}

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "#text" in node) {
    return String((node as Record<string, unknown>)["#text"] ?? "");
  }
  return "";
}

// ---------------------------------------------------------------- arXiv

/** Categories most likely to carry conjecture resolutions. */
export const ARXIV_CATEGORIES = [
  "math.NT",
  "math.CO",
  "math.AG",
  "math.GT",
  "math.LO",
  "math.DS",
  "math.PR",
  "math.CA",
  "math.AP",
  "math.GR",
  "math.RT",
  "math.OA",
  "math.MG",
  "cs.LO",
  "cs.DM",
  "cs.CC",
];

export async function fetchArxiv(): Promise<Candidate[]> {
  // arXiv permits one request every three seconds; the throttle in lib/http
  // enforces it. One combined feed keeps us to a single request.
  const url = `https://rss.arxiv.org/rss/${ARXIV_CATEGORIES.join("+")}`;
  const xml = await fetchText(url, { ttl: 1800 });
  const doc = parser.parse(xml) as {
    rss?: { channel?: { item?: unknown } };
  };

  return asArray(doc.rss?.channel?.item as Record<string, unknown>[]).map((item) => {
    const link = String(item.link ?? "");
    const title = stripHtml(String(item.title ?? ""));
    const description = stripHtml(String(textOf(item.description)));
    const creators = stripHtml(String(item["dc:creator"] ?? ""));
    return {
      key: `arxiv:${hash(link)}`,
      kind: "arxiv" as const,
      url: link,
      title,
      text: description,
      authors: creators ? creators.split(/,\s*/).filter(Boolean) : [],
      published: item.pubDate ? new Date(String(item.pubDate)).toISOString().slice(0, 10) : null,
      origin: "arXiv new submissions",
    };
  });
}

// ---------------------------------------------------------- Hacker News

/** The Algolia index needs no key and no auth. */
export async function fetchHackerNews(): Promise<Candidate[]> {
  const queries = ["conjecture", "theorem proved", "mathematicians prove"];
  const out: Candidate[] = [];

  for (const query of queries) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=50`;
    const data = await fetchJson<{
      hits: { objectID: string; title: string | null; url: string | null; story_text: string | null; created_at: string }[];
    }>(url, { ttl: 1800 });

    for (const hit of data.hits) {
      if (!hit.title) continue;
      out.push({
        key: `hn:${hit.objectID}`,
        kind: "hackernews",
        url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
        title: stripHtml(hit.title),
        text: stripHtml(hit.story_text ?? ""),
        authors: [],
        published: hit.created_at.slice(0, 10),
        origin: "Hacker News",
      });
    }
  }

  return out;
}

// ------------------------------------------------------------ Mathstodon

/**
 * Mathstodon is where much of the mathematical community that used to post on
 * X now posts, and its public timeline needs no authentication.
 */
export async function fetchMathstodon(): Promise<Candidate[]> {
  const url = "https://mathstodon.xyz/api/v1/timelines/public?local=true&limit=40";
  const posts = await fetchJson<
    {
      id: string;
      uri: string;
      url: string | null;
      content: string;
      created_at: string;
      account: { acct: string; display_name: string };
    }[]
  >(url, { ttl: 900 });

  return posts.map((post) => ({
    key: `mastodon:${post.id}`,
    kind: "mastodon" as const,
    url: post.url ?? post.uri,
    title: stripHtml(post.content).slice(0, 180),
    text: stripHtml(post.content),
    authors: [post.account.display_name || post.account.acct],
    published: post.created_at.slice(0, 10),
    origin: "Mathstodon",
  }));
}

// ------------------------------------------------------------- Wikipedia

/**
 * Someone editing the Wikipedia article for a conjecture is a strong, free
 * signal that its status may have changed. Two API calls cover every article in
 * the conjecture categories, so this costs essentially nothing.
 */
export async function fetchWikipediaEdits(withinDays = 7): Promise<Candidate[]> {
  const categories = ["Category:Conjectures", "Category:Unsolved_problems_in_mathematics"];
  const cutoff = new Date(Date.now() - withinDays * 86400_000).toISOString();
  const out: Candidate[] = [];

  for (const category of categories) {
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2" +
      `&generator=categorymembers&gcmtitle=${encodeURIComponent(category)}&gcmlimit=500&gcmnamespace=0` +
      "&prop=revisions&rvprop=timestamp|comment|user&rvslots=main";

    const data = await fetchJson<{
      query?: {
        pages?: {
          title: string;
          revisions?: { timestamp: string; comment?: string; user?: string }[];
        }[];
      };
    }>(url, { ttl: 1800 });

    for (const page of data.query?.pages ?? []) {
      const revision = page.revisions?.[0];
      // The API returns each article's latest revision whatever its age, so
      // without this the whole category would look freshly edited every run.
      if (!revision || revision.timestamp < cutoff) continue;
      const day = revision.timestamp.slice(0, 10);
      out.push({
        // Keyed by page and day so one edit per article per day is considered.
        key: `wikipedia:${hash(`${page.title}:${day}`)}`,
        kind: "wikipedia",
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        title: page.title,
        text: `Wikipedia article "${page.title}" was edited on ${day}${
          revision.comment ? ` with the summary: ${revision.comment}` : ""
        }.`,
        authors: revision.user ? [revision.user] : [],
        published: day,
        origin: "Wikipedia edits",
      });
    }
  }

  return out;
}

// ------------------------------------------------------------------ RSS

export const BLOG_FEEDS: { url: string; label: string }[] = [
  { url: "https://terrytao.wordpress.com/feed/", label: "What's new (Terence Tao)" },
  { url: "https://www.quantamagazine.org/mathematics/feed/", label: "Quanta Magazine" },
  { url: "https://gilkalai.wordpress.com/feed/", label: "Combinatorics and more (Gil Kalai)" },
  { url: "https://www.scottaaronson.blog/?feed=rss2", label: "Shtetl-Optimized" },
  { url: "https://www.math.columbia.edu/~woit/wordpress/?feed=rss2", label: "Not Even Wrong" },
  { url: "https://xenaproject.wordpress.com/feed/", label: "The Xena Project" },
  { url: "https://golem.ph.utexas.edu/category/atom10.xml", label: "The n-Category Café" },
];

export async function fetchFeed(feed: { url: string; label: string }): Promise<Candidate[]> {
  const xml = await fetchText(feed.url, { ttl: 1800 });
  const doc = parser.parse(xml) as Record<string, any>;

  const rssItems = asArray(doc?.rss?.channel?.item) as Record<string, unknown>[];
  const atomEntries = asArray(doc?.feed?.entry) as Record<string, unknown>[];

  const fromRss = rssItems.map((item) => {
    const link = String(item.link ?? "");
    return {
      key: `feed:${hash(link || String(item.guid ?? item.title))}`,
      kind: "blog" as const,
      url: link,
      title: stripHtml(String(textOf(item.title))),
      text: stripHtml(String(textOf(item.description) || textOf(item["content:encoded"]))).slice(0, 4000),
      authors: item["dc:creator"] ? [stripHtml(String(item["dc:creator"]))] : [],
      published: item.pubDate ? new Date(String(item.pubDate)).toISOString().slice(0, 10) : null,
      origin: feed.label,
    };
  });

  const fromAtom = atomEntries.map((entry) => {
    const linkNode = asArray(entry.link as Record<string, unknown>[])[0];
    const link =
      typeof linkNode === "string" ? linkNode : String((linkNode as Record<string, unknown>)?.["@_href"] ?? "");
    return {
      key: `feed:${hash(link || String(entry.id ?? ""))}`,
      kind: "blog" as const,
      url: link,
      title: stripHtml(String(textOf(entry.title))),
      text: stripHtml(String(textOf(entry.summary) || textOf(entry.content))).slice(0, 4000),
      authors: [],
      published: entry.updated ? String(entry.updated).slice(0, 10) : null,
      origin: feed.label,
    };
  });

  return [...fromRss, ...fromAtom].filter((c) => c.url);
}

// ----------------------------------------------------------- Lean Zulip

/**
 * The Lean Zulip is often the first place a claimed proof gets formalized and
 * picked apart. Its public streams are readable through the API, but Zulip
 * still requires credentials for the REST endpoint, so this source stays off
 * unless ZULIP_EMAIL and ZULIP_API_KEY are configured. It degrades to nothing
 * rather than failing the run.
 */
export async function fetchLeanZulip(env: NodeJS.ProcessEnv = process.env): Promise<Candidate[]> {
  const email = env.ZULIP_EMAIL;
  const apiKey = env.ZULIP_API_KEY;
  if (!email || !apiKey) return [];

  const narrow = encodeURIComponent(JSON.stringify([{ operator: "streams", operand: "public" }]));
  const url = `https://leanprover.zulipchat.com/api/v1/messages?anchor=newest&num_before=200&num_after=0&narrow=${narrow}&apply_markdown=false`;
  const auth = Buffer.from(`${email}:${apiKey}`).toString("base64");

  const data = await fetchJson<{
    messages?: { id: number; content: string; sender_full_name: string; timestamp: number; subject: string }[];
  }>(url, { ttl: 900, headers: { authorization: `Basic ${auth}` } });

  return (data.messages ?? []).map((message) => ({
    key: `zulip:${message.id}`,
    kind: "zulip" as const,
    url: `https://leanprover.zulipchat.com/#narrow/near/${message.id}`,
    title: message.subject,
    text: stripHtml(message.content),
    authors: [message.sender_full_name],
    published: new Date(message.timestamp * 1000).toISOString().slice(0, 10),
    origin: "Lean Zulip",
  }));
}

// ------------------------------------------------------------ orchestrate

export interface SourceResult {
  origin: string;
  candidates: Candidate[];
  error?: string;
}

/** Runs every source, isolating failures so one dead feed cannot kill the sweep. */
export async function fetchAllSources(): Promise<SourceResult[]> {
  const tasks: { origin: string; run: () => Promise<Candidate[]> }[] = [
    { origin: "arXiv", run: fetchArxiv },
    { origin: "Hacker News", run: fetchHackerNews },
    { origin: "Mathstodon", run: fetchMathstodon },
    { origin: "Wikipedia", run: fetchWikipediaEdits },
    { origin: "Lean Zulip", run: () => fetchLeanZulip() },
    ...BLOG_FEEDS.map((feed) => ({ origin: feed.label, run: () => fetchFeed(feed) })),
  ];

  const results: SourceResult[] = [];
  for (const task of tasks) {
    try {
      results.push({ origin: task.origin, candidates: await task.run() });
    } catch (error) {
      results.push({
        origin: task.origin,
        candidates: [],
        error: (error as Error).message,
      });
    }
  }
  return results;
}
