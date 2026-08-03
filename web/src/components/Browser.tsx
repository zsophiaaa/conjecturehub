"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { StatusChip } from "./StatusBadge";
import type { EvidenceTier } from "@/lib/corpus";

/**
 * Client-side search over the whole corpus. The index is a couple of hundred
 * kilobytes, so it is faster to ship it once and search in the browser than to
 * round-trip to a server we would then have to pay for.
 */

interface Entry {
  i: string;
  t: string;
  s: string;
  e: string;
  g: string[];
  a: string;
  l: 0 | 1;
  c: number;
  /** Counters below are absent rather than zero to keep the payload small. */
  f?: number;
  fc?: number;
  ai?: number;
  v?: 1;
  b?: 1;
  k?: 1;
  /** 1 when the resolution rests on a report of the proof rather than the proof. */
  r?: 1;
}

const PAGE_SIZE = 60;

const STATUS_FILTERS = [
  { key: "", label: "Any status" },
  { key: "open", label: "Open" },
  { key: "proved", label: "Proved" },
  { key: "disproved", label: "Disproved" },
  { key: "partially_resolved", label: "Partial" },
  { key: "claimed", label: "Claim recorded" },
  { key: "disputed", label: "Disputed" },
  { key: "independent", label: "Independent" },
  { key: "resolved_by_prior_literature", label: "Already in the literature" },
];

const SORT_OPTIONS = [
  { key: "relevance", label: "Relevance" },
  { key: "discussion", label: "Most forum activity" },
  { key: "ai", label: "Most AI-assisted claims" },
  { key: "claims", label: "Most claims" },
];

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Prefix-token scoring: exact title hits first, then aliases, then tags. */
function score(entry: Entry, tokens: string[], haystack: string): number {
  if (tokens.length === 0) return 0;
  let total = 0;
  const title = entry.t.toLowerCase();

  for (const token of tokens) {
    if (!haystack.includes(token)) return -1;
    if (title.startsWith(token)) total += 10;
    else if (title.includes(token)) total += 6;
    else if (entry.a.toLowerCase().includes(token)) total += 4;
    else total += 1;
  }

  if (title === tokens.join(" ")) total += 40;
  return total;
}

export function Browser({ tags }: { tags: { tag: string; count: number }[] }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [leanOnly, setLeanOnly] = useState(false);
  const [discussionOnly, setDiscussionOnly] = useState(false);
  const [benchmarkOnly, setBenchmarkOnly] = useState(false);
  const [aiOnly, setAiOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState("relevance");
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialStatus = params.get("status");
    if (initialStatus) setStatus(initialStatus);
    const initialQuery = params.get("q");
    if (initialQuery) setQuery(initialQuery);
    if (params.get("discussion") === "1") setDiscussionOnly(true);
    if (params.get("benchmark") === "1") setBenchmarkOnly(true);
    if (params.get("ai") === "1") setAiOnly(true);
    if (params.get("verified") === "1") setVerifiedOnly(true);
    const initialSort = params.get("sort");
    if (initialSort === "discussion" || initialSort === "claims" || initialSort === "ai") setSort(initialSort);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/index/search.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Entry[]>;
      })
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const haystacks = useMemo(() => {
    if (!entries) return null;
    return entries.map((e) => `${e.t} ${e.a} ${e.g.join(" ")} ${e.i}`.toLowerCase());
  }, [entries]);

  const results = useMemo(() => {
    if (!entries || !haystacks) return [];
    const tokens = tokenize(query);

    const scored: { entry: Entry; score: number }[] = [];
    for (let idx = 0; idx < entries.length; idx++) {
      const entry = entries[idx]!;
      if (status && entry.s !== status) continue;
      if (leanOnly && entry.l !== 1) continue;
      if (tag && !entry.g.includes(tag)) continue;
      if (discussionOnly && !entry.f && !entry.fc) continue;
      if (benchmarkOnly && !entry.b) continue;
      if (aiOnly && !entry.ai) continue;
      if (verifiedOnly && !entry.v) continue;

      const s = score(entry, tokens, haystacks[idx]!);
      if (s < 0) continue;
      scored.push({ entry, score: s });
    }

    scored.sort((a, b) => {
      const forum = (e: Entry) => e.f ?? 0;
      const aiClaims = (e: Entry) => e.ai ?? 0;
      // Prefer the observed upstream comment count; fall back to what we curated.
      const activity = (e: Entry) => e.fc ?? 0;

      if (sort === "discussion") {
        return (
          activity(b.entry) - activity(a.entry) ||
          forum(b.entry) - forum(a.entry) ||
          a.entry.t.localeCompare(b.entry.t)
        );
      }
      if (sort === "ai") {
        return (
          aiClaims(b.entry) - aiClaims(a.entry) ||
          (b.entry.v ?? 0) - (a.entry.v ?? 0) ||
          a.entry.t.localeCompare(b.entry.t)
        );
      }
      if (sort === "claims") {
        return (
          b.entry.c - a.entry.c ||
          forum(b.entry) - forum(a.entry) ||
          a.entry.t.localeCompare(b.entry.t)
        );
      }
      return (
        b.score - a.score || forum(b.entry) - forum(a.entry) || a.entry.t.localeCompare(b.entry.t)
      );
    });

    return scored.map((s) => s.entry);
  }, [entries, haystacks, query, status, tag, leanOnly, discussionOnly, benchmarkOnly, aiOnly, verifiedOnly, sort]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, status, tag, leanOnly, discussionOnly, benchmarkOnly, aiOnly, verifiedOnly, sort]);

  const anyFilter =
    Boolean(query) ||
    Boolean(status) ||
    Boolean(tag) ||
    leanOnly ||
    discussionOnly ||
    benchmarkOnly ||
    aiOnly ||
    verifiedOnly ||
    sort !== "relevance";

  function clearFilters() {
    setQuery("");
    setStatus("");
    setTag("");
    setLeanOnly(false);
    setDiscussionOnly(false);
    setBenchmarkOnly(false);
    setAiOnly(false);
    setVerifiedOnly(false);
    setSort("relevance");
  }

  const inputClass = "ui-input";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-64 flex-1">
          <span className="sr-only">Search conjectures</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, alias, or tag"
            className={`w-full ${inputClass}`}
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="sr-only">Sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={inputClass}>
            {SORT_OPTIONS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="sr-only">Filter by status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <span className="sr-only">Filter by tag</span>
          <select value={tag} onChange={(e) => setTag(e.target.value)} className={inputClass}>
            <option value="">Any subject</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>
                {t.tag} ({t.count})
              </option>
            ))}
          </select>
        </label>

        <label className="flex cursor-pointer items-center gap-2 border border-border-strong bg-surface-1 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={leanOnly}
            onChange={(e) => setLeanOnly(e.target.checked)}
            className="size-4"
          />
          Has a Lean statement
        </label>

        <label className="flex cursor-pointer items-center gap-2 border border-border-strong bg-surface-1 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={discussionOnly}
            onChange={(e) => setDiscussionOnly(e.target.checked)}
            className="size-4"
          />
          Forum discussion
        </label>

        <label className="flex cursor-pointer items-center gap-2 border border-border-strong bg-surface-1 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={benchmarkOnly}
            onChange={(e) => setBenchmarkOnly(e.target.checked)}
            className="size-4"
          />
          Agent benchmark
        </label>

        <label className="flex cursor-pointer items-center gap-2 border border-border-strong bg-surface-1 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={aiOnly}
            onChange={(e) => setAiOnly(e.target.checked)}
            className="size-4"
          />
          AI-assisted claims
        </label>

        <label className="flex cursor-pointer items-center gap-2 border border-border-strong bg-surface-1 px-3 py-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
            className="size-4"
          />
          Machine-verified
        </label>
      </div>

      {error ? (
        <p className="ui-alert">
          Could not load the search index ({error}). Run <code>npm run build:index</code> and reload.
        </p>
      ) : !entries ? (
        <p className="text-ink-muted">Loading index…</p>
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
            <span>
              {results.length.toLocaleString("en-US")} of {entries.length.toLocaleString("en-US")} conjectures
              {discussionOnly ? " with forum discussion" : ""}
              {benchmarkOnly ? " in agent benchmark" : ""}
              {aiOnly ? " with AI-assisted claims" : ""}
              {verifiedOnly ? " with machine-verified claims" : ""}
            </span>
            {anyFilter ? (
              <button type="button" onClick={clearFilters} className="underline">
                Clear filters
              </button>
            ) : null}
          </p>

          <ul className="ui-panel divide-y divide-border overflow-hidden">
            {results.slice(0, limit).map((entry) => (
              <li key={entry.i}>
                <Link
                  href={`/conjectures/${entry.i}/`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 no-underline transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-ink">{entry.t}</span>
                    {entry.g.length > 0 ? (
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">
                        {entry.g.filter((g) => !g.startsWith("msc:")).slice(0, 5).join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    {entry.b ? (
                      <span className="rounded border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-ink-muted">
                        benchmark
                      </span>
                    ) : null}
                    {entry.ai ? (
                      <span
                        className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-ink-muted"
                        title={`${entry.ai} AI-assisted claim(s)`}
                      >
                        AI×{entry.ai}
                      </span>
                    ) : null}
                    {entry.v ? (
                      <span className="rounded border border-emerald-600/30 bg-emerald-600/10 px-1.5 py-0.5 text-[11px] text-ink-muted">
                        verified
                      </span>
                    ) : null}
                    {entry.k ? (
                      <span className="rounded border border-amber-600/30 bg-amber-600/10 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                        CI
                      </span>
                    ) : null}
                    {entry.fc || entry.f ? (
                      <span
                        className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] text-ink-muted"
                        title={
                          entry.fc
                            ? `${entry.fc} comments on the upstream forum thread`
                            : `${entry.f} forum-sourced claim(s) curated here`
                        }
                      >
                        {entry.fc ? `${entry.fc} comments` : `${entry.f} forum`}
                      </span>
                    ) : null}
                    {entry.l === 1 ? (
                      <span className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
                        Lean
                      </span>
                    ) : null}
                    <StatusChip
                      statusKey={entry.s}
                      tier={(entry.e || null) as EvidenceTier | null}
                      attestation={entry.r ? "secondary" : "primary"}
                      size="sm"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {results.length === 0 ? (
            <p className="ui-panel px-4 py-6 text-center text-ink-muted">
              Nothing matched. If a conjecture is missing,{" "}
              <a href="https://github.com/zsophiaaa/conjecturehub/issues/new">tell us</a> or open a pull request.
            </p>
          ) : null}

          {limit < results.length ? (
            <button
              type="button"
              onClick={() => setLimit((l) => l + PAGE_SIZE * 4)}
              className="ui-btn w-full"
            >
              Show more ({(results.length - limit).toLocaleString("en-US")} remaining)
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
