import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CACHE_DIR } from "./paths.js";

/**
 * Polite HTTP. Every source we use is someone else's free infrastructure, so we
 * identify ourselves, respect per-host minimum intervals, and cache on disk so
 * that re-running an ingester does not re-hit the network.
 */

export const USER_AGENT =
  "ConjectureHub/0.1 (+https://github.com/zsophiaaa/conjecturehub; conjecture status index; contact via GitHub issues)";

/** Minimum milliseconds between requests, per host. arXiv's published limit is one request per three seconds. */
const HOST_INTERVAL_MS: Record<string, number> = {
  "export.arxiv.org": 3000,
  "rss.arxiv.org": 3000,
  "arxiv.org": 3000,
  "query.wikidata.org": 1000,
  "en.wikipedia.org": 200,
  "api.github.com": 200,
  "raw.githubusercontent.com": 100,
  "api.stackexchange.com": 1000,
  "mathstodon.xyz": 500,
  "hacker-news.firebaseio.com": 100,
};

const DEFAULT_INTERVAL_MS = 500;
const lastRequest = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function throttle(url: string): Promise<void> {
  const host = new URL(url).host;
  const interval = HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
  const last = lastRequest.get(host) ?? 0;
  const wait = last + interval - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequest.set(host, Date.now());
}

function cachePath(url: string): string {
  const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 32);
  return path.join(CACHE_DIR, `${hash}.cache`);
}

export interface FetchOptions {
  /** Seconds a cached copy stays fresh. 0 disables the cache. */
  ttl?: number;
  headers?: Record<string, string>;
  /** Retries on 5xx and network errors. */
  retries?: number;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { ttl = 3600, headers = {}, retries = 3 } = options;
  const file = cachePath(url);

  if (ttl > 0 && fs.existsSync(file)) {
    const age = (Date.now() - fs.statSync(file).mtimeMs) / 1000;
    if (age < ttl) return fs.readFileSync(file, "utf8");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await throttle(url);
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "*/*", ...headers },
        redirect: "follow",
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }
      if (!res.ok) {
        throw Object.assign(new Error(`HTTP ${res.status} from ${url}`), { fatal: true });
      }
      const body = await res.text();
      if (ttl > 0) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
        fs.writeFileSync(file, body, "utf8");
      }
      return body;
    } catch (error) {
      lastError = error;
      if ((error as { fatal?: boolean }).fatal) break;
      if (attempt < retries) await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function fetchJson<T = unknown>(url: string, options: FetchOptions = {}): Promise<T> {
  const body = await fetchText(url, {
    ...options,
    headers: { accept: "application/json", ...options.headers },
  });
  return JSON.parse(body) as T;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
