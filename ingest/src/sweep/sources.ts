import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { fetchJson, fetchText, USER_AGENT } from "../lib/http.js";
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

/**
 * arXiv's dc:creator carries names in TeX, so François arrives as
 * `Fran\c{c}ois`. Left alone it is written into the corpus verbatim and a
 * person's name is misspelt on their own record, which is the kind of small
 * disrespect that is worth a dozen lines to avoid.
 *
 * This covers the accents that actually appear in mathematicians' names. It is
 * not a TeX parser and does not try to be; anything left over is passed
 * through, so an unhandled escape is visible rather than silently mangled.
 */
const TEX_ACCENTS: ReadonlyArray<[RegExp, string]> = [
  [/\\c\{c\}/g, "ç"],
  [/\\c\{C\}/g, "Ç"],
  [/\\'\{?([aeiounycsz])\}?/gi, "$1\u0301"],
  [/\\`\{?([aeiou])\}?/gi, "$1\u0300"],
  [/\\\^\{?([aeiouwy])\}?/gi, "$1\u0302"],
  [/\\"\{?([aeiouy])\}?/gi, "$1\u0308"],
  [/\\~\{?([anou])\}?/gi, "$1\u0303"],
  [/\\v\{?([cszrdtlneg])\}?/gi, "$1\u030C"],
  [/\\u\{?([ag])\}?/gi, "$1\u0306"],
  [/\\H\{?([ou])\}?/gi, "$1\u030B"],
  [/\\r\{?([au])\}?/gi, "$1\u030A"],
  [/\\=\{?([aeiou])\}?/gi, "$1\u0304"],
  [/\\\.\{?([zcgeI])\}?/g, "$1\u0307"],
  [/\\k\{?([ae])\}?/gi, "$1\u0328"],
  [/\\l\b/g, "ł"],
  [/\\L\b/g, "Ł"],
  [/\\o\b/g, "ø"],
  [/\\O\b/g, "Ø"],
  [/\\aa\b/g, "å"],
  [/\\AA\b/g, "Å"],
  [/\\ss\b/g, "ß"],
  [/\\ae\b/g, "æ"],
  [/\\AE\b/g, "Æ"],
];

export function deTex(input: string): string {
  let out = input;
  for (const [pattern, replacement] of TEX_ACCENTS) out = out.replace(pattern, replacement);
  // Combining marks above are composed into single code points so the result
  // compares equal to a name typed normally.
  return out.replace(/[{}]/g, "").normalize("NFC").trim();
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
      authors: creators ? creators.split(/,\s*/).map(deTex).filter(Boolean) : [],
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

/**
 * Lab announcements. The October 2025 episode and the August 2026 ten-proofs
 * post both broke here first, so the primary announcement is worth reading
 * directly rather than waiting for it to reach a blog that covers it.
 */
export const LAB_FEEDS: { url: string; label: string }[] = [
  { url: "https://openai.com/news/rss.xml", label: "OpenAI news" },
  { url: "https://deepmind.google/blog/rss.xml", label: "Google DeepMind blog" },
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

// ---------------------------------------------------------------- GitHub

export interface RepoWatch {
  repo: string;
  label: string;
  /** Restricts the commit listing to one subtree; the API takes a single path. */
  path?: string;
}

/**
 * The upstream catalogues we seed from are git repositories, and a commit or a
 * pull request that flips a problem from open to solved is the highest-precision
 * signal available anywhere: it is a specific person editing a specific record,
 * with a diff attached, rather than a headline that might be about something
 * else entirely.
 *
 * Seeding pins formal-conjectures to a tagged release, because formalizations
 * stop compiling within months. Watching is a different job with a different
 * trade-off, so this reads the moving head instead.
 *
 * Unauthenticated the GitHub API allows 60 requests an hour, which two watches
 * at four requests a run fit inside comfortably. GITHUB_TOKEN raises it to
 * 5,000 and is present by default inside Actions.
 */
export async function fetchGitHubActivity(
  watch: RepoWatch,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Candidate[]> {
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  const headers: Record<string, string> = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const out: Candidate[] = [];

  const pulls = await fetchJson<
    {
      number: number;
      title: string;
      body: string | null;
      html_url: string;
      updated_at: string;
      merged_at: string | null;
      state: string;
      user: { login: string } | null;
    }[]
  >(
    `https://api.github.com/repos/${watch.repo}/pulls?state=all&sort=updated&direction=desc&per_page=50`,
    { ttl: 900, headers },
  );

  for (const pull of pulls) {
    out.push({
      key: `github:${watch.repo}:pr:${pull.number}:${pull.updated_at.slice(0, 10)}`,
      kind: "github",
      url: pull.html_url,
      title: `${watch.label} PR #${pull.number}: ${stripHtml(pull.title)}`,
      // Whether it merged decides how much the pull request is worth, so say so
      // in the text the classifier reads rather than leaving it to infer.
      text: [
        `Pull request #${pull.number} against ${watch.repo}, currently ${pull.state}`,
        pull.merged_at ? `and merged on ${pull.merged_at.slice(0, 10)}` : "and not merged",
        `. ${stripHtml(pull.title)}. ${stripHtml(pull.body ?? "")}`,
      ]
        .join(" ")
        .slice(0, 4000),
      authors: pull.user ? [pull.user.login] : [],
      published: (pull.merged_at ?? pull.updated_at).slice(0, 10),
      origin: `${watch.label} pull requests`,
    });
  }

  const commitUrl =
    `https://api.github.com/repos/${watch.repo}/commits?per_page=50` +
    (watch.path ? `&path=${encodeURIComponent(watch.path)}` : "");

  const commits = await fetchJson<
    {
      sha: string;
      html_url: string;
      commit: { message: string; author: { name: string; date: string } | null };
      author: { login: string } | null;
    }[]
  >(commitUrl, { ttl: 900, headers });

  for (const commit of commits) {
    const message = stripHtml(commit.commit.message);
    out.push({
      key: `github:${watch.repo}:commit:${commit.sha}`,
      kind: "github",
      url: commit.html_url,
      title: `${watch.label}: ${message.split("\n")[0]!.slice(0, 200)}`,
      text: `Commit to ${watch.repo}${watch.path ? ` touching ${watch.path}` : ""}. ${message}`.slice(0, 4000),
      authors: [commit.author?.login ?? commit.commit.author?.name ?? ""].filter(Boolean),
      published: commit.commit.author?.date?.slice(0, 10) ?? null,
      origin: `${watch.label} commits`,
    });
  }

  return out;
}

export const REPO_WATCHES: RepoWatch[] = [
  {
    repo: "google-deepmind/formal-conjectures",
    label: "formal-conjectures",
    path: "FormalConjectures",
  },
  { repo: "teorth/erdosproblems", label: "erdosproblems", path: "data/problems.yaml" },
];

// ---------------------------------------------------------- MathOverflow

/**
 * MathOverflow is where a research mathematician asks whether a claimed proof
 * holds up, and the answer often lands there before it lands anywhere citable.
 * The Stack Exchange API is free and needs no key below 300 requests a day.
 */
export async function fetchMathOverflow(): Promise<Candidate[]> {
  const tags = ["open-problem", "conjectures"];
  const out: Candidate[] = [];

  for (const tag of tags) {
    const url =
      "https://api.stackexchange.com/2.3/questions" +
      `?site=mathoverflow.net&order=desc&sort=activity&tagged=${encodeURIComponent(tag)}` +
      "&pagesize=50&filter=withbody";

    const data = await fetchJson<{
      items?: {
        question_id: number;
        title: string;
        body?: string;
        link: string;
        last_activity_date: number;
        is_answered: boolean;
        accepted_answer_id?: number;
        owner?: { display_name?: string };
      }[];
    }>(url, { ttl: 1800 });

    for (const item of data.items ?? []) {
      out.push({
        key: `mathoverflow:${item.question_id}:${new Date(item.last_activity_date * 1000).toISOString().slice(0, 10)}`,
        kind: "mathoverflow",
        url: item.link,
        title: stripHtml(item.title),
        text: [
          stripHtml(item.title),
          item.accepted_answer_id ? "This question has an accepted answer." : "",
          stripHtml(item.body ?? ""),
        ]
          .filter(Boolean)
          .join(" ")
          .slice(0, 4000),
        authors: item.owner?.display_name ? [item.owner.display_name] : [],
        published: new Date(item.last_activity_date * 1000).toISOString().slice(0, 10),
        origin: `MathOverflow [${tag}]`,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------- Reddit

/**
 * r/math surfaces a claimed resolution within hours, and its comments usually
 * carry the first informed scepticism about it.
 *
 * The unauthenticated .json endpoints answer 403 to a server, and have done
 * since Reddit closed off free API access in 2023. A browser user agent gets
 * through, which is exactly why we do not send one: presenting as something we
 * are not to evade an access control is the same objection that keeps X out of
 * this file. So this source uses the documented OAuth application flow and
 * stays switched off until credentials exist, rather than failing every run.
 */
export async function fetchReddit(env: NodeJS.ProcessEnv = process.env): Promise<Candidate[]> {
  const clientId = env.REDDIT_CLIENT_ID;
  const clientSecret = env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
  });
  if (!tokenRes.ok) throw new Error(`Reddit token exchange failed: HTTP ${tokenRes.status}`);
  const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
  if (!token) throw new Error("Reddit token exchange returned no access_token");

  const url =
    "https://oauth.reddit.com/r/math/search" +
    "?q=conjecture+OR+proved+OR+disproved+OR+counterexample&restrict_sr=1&sort=new&t=month&limit=75";

  const data = await fetchJson<{
    data?: {
      children?: {
        data: {
          id: string;
          title: string;
          selftext: string;
          permalink: string;
          created_utc: number;
          author: string;
        };
      }[];
    };
  }>(url, { ttl: 1800, headers: { authorization: `Bearer ${token}` } });

  return (data.data?.children ?? []).map(({ data: post }) => ({
    key: `reddit:${post.id}`,
    kind: "reddit" as const,
    url: `https://www.reddit.com${post.permalink}`,
    title: stripHtml(post.title),
    text: stripHtml(`${post.title} ${post.selftext ?? ""}`).slice(0, 4000),
    authors: post.author ? [post.author] : [],
    published: new Date(post.created_utc * 1000).toISOString().slice(0, 10),
    origin: "r/math",
  }));
}

// ------------------------------------------------------------ orchestrate

export interface SourceContext {
  env: NodeJS.ProcessEnv;
  windowDays: number;
}

/**
 * One watched source. Registering a source rather than appending to an inline
 * task list buys two things the flat version could not: a stable `id` to report
 * health against, and an explicit `unavailable` check so a source that is
 * switched off for want of credentials is reported as configured-off rather
 * than silently returning nothing and looking healthy.
 */
export interface SweepSource {
  id: string;
  label: string;
  /** Returns why the source cannot run, or null when it can. */
  unavailable?: (ctx: SourceContext) => string | null;
  run: (ctx: SourceContext) => Promise<Candidate[]>;
}

export interface SourceResult {
  id: string;
  origin: string;
  candidates: Candidate[];
  error?: string;
  /** Set when the source was deliberately not run. */
  skipped?: string;
}

export const SOURCES: SweepSource[] = [
  { id: "arxiv", label: "arXiv", run: () => fetchArxiv() },
  { id: "hackernews", label: "Hacker News", run: () => fetchHackerNews() },
  { id: "mathstodon", label: "Mathstodon", run: () => fetchMathstodon() },
  { id: "mathoverflow", label: "MathOverflow", run: () => fetchMathOverflow() },
  {
    id: "reddit",
    label: "r/math",
    unavailable: (ctx) =>
      ctx.env.REDDIT_CLIENT_ID && ctx.env.REDDIT_CLIENT_SECRET
        ? null
        : "REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not set",
    run: (ctx) => fetchReddit(ctx.env),
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    run: (ctx) => fetchWikipediaEdits(Math.min(ctx.windowDays, 14)),
  },
  {
    id: "zulip",
    label: "Lean Zulip",
    unavailable: (ctx) =>
      ctx.env.ZULIP_EMAIL && ctx.env.ZULIP_API_KEY
        ? null
        : "ZULIP_EMAIL and ZULIP_API_KEY are not set",
    run: (ctx) => fetchLeanZulip(ctx.env),
  },
  ...REPO_WATCHES.map((watch) => ({
    id: `github:${watch.repo}`,
    label: watch.label,
    run: (ctx: SourceContext) => fetchGitHubActivity(watch, ctx.env),
  })),
  ...[...BLOG_FEEDS, ...LAB_FEEDS].map((feed) => ({
    id: `feed:${new URL(feed.url).host}`,
    label: feed.label,
    run: () => fetchFeed(feed),
  })),
];

/** Runs every source, isolating failures so one dead feed cannot kill the sweep. */
export async function fetchAllSources(
  ctx: SourceContext = { env: process.env, windowDays: 14 },
): Promise<SourceResult[]> {
  const results: SourceResult[] = [];

  for (const source of SOURCES) {
    const reason = source.unavailable?.(ctx) ?? null;
    if (reason) {
      results.push({ id: source.id, origin: source.label, candidates: [], skipped: reason });
      continue;
    }
    try {
      results.push({ id: source.id, origin: source.label, candidates: await source.run(ctx) });
    } catch (error) {
      results.push({
        id: source.id,
        origin: source.label,
        candidates: [],
        error: (error as Error).message,
      });
    }
  }

  return results;
}
