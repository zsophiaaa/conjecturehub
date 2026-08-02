import fs from "node:fs";
import path from "node:path";
import { readAll } from "../lib/conjecture.js";
import { CACHE_DIR } from "../lib/paths.js";
import { USER_AGENT } from "../lib/http.js";
import type { Conjecture } from "../types.js";

/**
 * Checks that every URL the corpus cites actually resolves.
 *
 * This exists because a fabricated citation reached the corpus: a provenance
 * entry pointed at an erdosproblems.com forum thread for the Jacobian
 * conjecture, which is not an Erdos problem and never had one. A record that
 * cites a URL nobody can open is worse than a record with no citation, because
 * it looks sourced.
 *
 *   --sample N     check N urls spread evenly across the corpus, not all of them
 *   --id ID        restrict to one conjecture
 *   --host HOST    restrict to one host
 *   --ttl SECONDS  reuse cached statuses younger than this (default 7 days)
 *   --strict       exit non-zero when a 4xx is found
 *
 * Requests are throttled per host and statuses are cached, so re-running is
 * cheap and nobody's free infrastructure gets hammered.
 */

const DEFAULT_TTL_SECONDS = 7 * 24 * 3600;
const DEFAULT_INTERVAL_MS = 700;

/** Hosts that block automated requests by policy. A failure here means nothing. */
const BLOCKS_BOTS = new Set(["x.com", "twitter.com", "www.x.com", "mobile.twitter.com"]);

const HOST_INTERVAL_MS: Record<string, number> = {
  "arxiv.org": 3000,
  "www.erdosproblems.com": 1000,
  "erdosproblems.com": 1000,
  "doi.org": 1000,
  "oeis.org": 1000,
};

interface LinkRef {
  conjectureId: string;
  where: string;
}

interface Result {
  url: string;
  status: number | null;
  note: string;
  refs: LinkRef[];
}

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Strips punctuation a URL picked up from surrounding prose, without damaging
 * the URL itself. A closing paren is only dropped when nothing opened it, so
 * `.../Milnor_conjecture_(Ricci_curvature)` survives intact.
 */
function trimTrailingPunctuation(url: string): string {
  let out = url.replace(/[.,;]+$/, "");
  while (out.endsWith(")")) {
    const opens = (out.match(/\(/g) ?? []).length;
    const closes = (out.match(/\)/g) ?? []).length;
    if (opens >= closes) break;
    out = out.slice(0, -1).replace(/[.,;]+$/, "");
  }
  return out;
}

function collect(records: Conjecture[]): Map<string, LinkRef[]> {
  const urls = new Map<string, LinkRef[]>();

  const add = (url: string | null | undefined, conjectureId: string, where: string) => {
    if (!url || !/^https?:\/\//.test(url)) return;
    const clean = trimTrailingPunctuation(url);
    const existing = urls.get(clean);
    if (existing) existing.push({ conjectureId, where });
    else urls.set(clean, [{ conjectureId, where }]);
  };

  for (const r of records) {
    for (const [i, claim] of (r.claims ?? []).entries()) {
      add(claim.source?.url, r.id, `claims[${i}].source.url`);
      add(claim.verification?.run_url, r.id, `claims[${i}].verification.run_url`);
    }
    for (const [i, ext] of (r.ids?.external ?? []).entries()) {
      add(ext.url, r.id, `ids.external[${i}].url`);
    }
    add(r.ids?.wikipedia, r.id, "ids.wikipedia");
    add(r.ids?.mathworld, r.id, "ids.mathworld");
    for (const [i, p] of (r.provenance ?? []).entries()) {
      add(p.url, r.id, `provenance[${i}].url`);
    }
  }

  return urls;
}

/** Evenly spread rather than random, so repeated runs cover the same slice. */
function spread<T>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]!);
}

const CACHE_FILE = path.join(CACHE_DIR, "link-status.json");

function loadCache(ttlSeconds: number): Map<string, number> {
  if (!fs.existsSync(CACHE_FILE)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) as Record<
      string,
      { status: number; checkedAt: number }
    >;
    const fresh = new Map<string, number>();
    for (const [url, entry] of Object.entries(raw)) {
      if ((Date.now() - entry.checkedAt) / 1000 < ttlSeconds) fresh.set(url, entry.status);
    }
    return fresh;
  } catch {
    return new Map();
  }
}

function saveCache(statuses: Map<string, number>): void {
  const out: Record<string, { status: number; checkedAt: number }> = {};
  for (const [url, status] of statuses) out[url] = { status, checkedAt: Date.now() };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(out), "utf8");
}

async function probe(url: string): Promise<number | null> {
  const headers = { "user-agent": USER_AGENT, accept: "*/*" };
  try {
    // HEAD is cheaper, but plenty of static hosts refuse it.
    const head = await fetch(url, { method: "HEAD", headers, redirect: "follow" });
    if (head.status !== 405 && head.status !== 501 && head.status !== 403) return head.status;
    const get = await fetch(url, { method: "GET", headers, redirect: "follow" });
    return get.status;
  } catch {
    return null;
  }
}

const ttl = Number(option("ttl") ?? DEFAULT_TTL_SECONDS);
const onlyId = option("id");
const onlyHost = option("host");
const sampleSize = option("sample") ? Number(option("sample")) : undefined;

let records = readAll();
if (onlyId) records = records.filter((r) => r.id === onlyId);

const allUrls = collect(records);
let urls = [...allUrls.keys()].sort();
if (onlyHost) urls = urls.filter((u) => new URL(u).host === onlyHost);
const selected = sampleSize ? spread(urls, sampleSize) : urls;

console.log(
  `Checking ${selected.length} of ${urls.length} distinct URLs across ${records.length} conjectures.`,
);

const cached = loadCache(ttl);
const statuses = new Map(cached);
const results: Result[] = [];
const lastHit = new Map<string, number>();

for (const [i, url] of selected.entries()) {
  const refs = allUrls.get(url)!;
  const host = new URL(url).host;

  if (BLOCKS_BOTS.has(host)) {
    results.push({ url, status: null, note: "host blocks automated requests", refs });
    continue;
  }

  let status = cached.get(url);
  if (status === undefined) {
    const interval = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
    const wait = (lastHit.get(host) ?? 0) + interval - Date.now();
    if (wait > 0) await sleep(wait);
    lastHit.set(host, Date.now());

    const probed = await probe(url);
    if (probed !== null) {
      status = probed;
      statuses.set(url, probed);
    }
    if ((i + 1) % 25 === 0) console.log(`  ...${i + 1}/${selected.length}`);
  }

  results.push({
    url,
    status: status ?? null,
    note: status === undefined ? "request failed" : "",
    refs,
  });
}

saveCache(statuses);

/**
 * A publisher refusing a bot is not a dead citation. Wiley, ResearchGate, IACR
 * and Cloudflare-fronted pages all answer 403 to a script and 200 to a browser,
 * so folding them in with 404s buries the citations that are genuinely gone.
 */
const FORBIDDEN = new Set([401, 403, 429]);

const broken = results.filter((r) => r.status !== null && r.status >= 400 && !FORBIDDEN.has(r.status));
const blocked = results.filter((r) => r.status !== null && FORBIDDEN.has(r.status));
const unreachable = results.filter((r) => r.status === null && r.note === "request failed");
const skipped = results.filter((r) => r.note === "host blocks automated requests");
const ok = results.filter((r) => r.status !== null && r.status < 400);

if (broken.length > 0) {
  console.log(`\nBROKEN (${broken.length}) — these citations do not resolve:`);
  for (const r of broken) {
    console.log(`  ${r.status}  ${r.url}`);
    for (const ref of r.refs.slice(0, 4)) console.log(`        ${ref.conjectureId} ${ref.where}`);
    if (r.refs.length > 4) console.log(`        ...and ${r.refs.length - 4} more`);
  }
}

if (blocked.length > 0) {
  console.log(
    `\nBLOCKED (${blocked.length}) — the host refused an automated request; not evidence the page is gone:`,
  );
  for (const r of blocked.slice(0, 20)) {
    console.log(`  ${r.status}  ${r.url}  (${r.refs[0]!.conjectureId})`);
  }
  if (blocked.length > 20) console.log(`  ...and ${blocked.length - 20} more`);
}

if (unreachable.length > 0) {
  console.log(`\nUNREACHABLE (${unreachable.length}) — network error, may be transient:`);
  for (const r of unreachable.slice(0, 20)) console.log(`  ${r.url}  (${r.refs[0]!.conjectureId})`);
  if (unreachable.length > 20) console.log(`  ...and ${unreachable.length - 20} more`);
}

console.log(
  `\nOK ${ok.length} · broken ${broken.length} · blocked ${blocked.length} · unreachable ${unreachable.length} · skipped ${skipped.length}`,
);

if (flag("strict") && broken.length > 0) {
  console.error("\nFailing because --strict was set and broken citations were found.");
  process.exit(1);
}
