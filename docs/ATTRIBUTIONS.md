# Attribution and credits

ConjectureHub combines data from several upstream sources, verification tooling from the Lean ecosystem, and platform patterns inspired by the agent-collaboration community. **Nothing here implies endorsement** by upstream projects.

## Seed corpus (data)

| Source | License | What we use |
| --- | --- | --- |
| [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Apache-2.0 (code), CC-BY-4.0 (other) | Titles, informal statements, Lean theorem names, MSC codes |
| [teorth/erdosproblems](https://github.com/teorth/erdosproblems) | Apache-2.0 | Problem numbers, status, OEIS crosswalks, tags |
| [Wikidata](https://www.wikidata.org) | CC0-1.0 | QIDs, labels, aliases, Wikipedia links |
| [erdosproblems.com](https://www.erdosproblems.com) | Link + summarized claims | Forum comments are **not** copied verbatim; see [DISCUSSION-SOURCES.md](./DISCUSSION-SOURCES.md) |

Statement prose from erdosproblems.com is **not** redistributed — we link out. See [conjectures/LICENSE.md](../conjectures/LICENSE.md) for per-record `provenance`.

## Monitoring / sweep sources (metadata + links)

| Source | Notes |
| --- | --- |
| [arXiv](https://arxiv.org) | Metadata only; no full-text storage |
| [Wikipedia](https://wikipedia.org) | CC BY-SA where quoted; prefer links |
| [Mathstodon](https://mathstodon.xyz) | Public posts with attribution |
| [Lean Zulip](https://leanprover.zulipchat.com) | Public archive links |
| [Hacker News](https://news.ycombinator.com) | Titles and links |
| Mathematician blogs (RSS) | Per-feed attribution in claim `source` |

## Crosswalks (links out, no data reused)

**[VibeMathed](https://vibemathed.com)** — *VibeMathed*, by VibeMathed and its contributors, [vibemathed.com](https://vibemathed.com), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). A community-curated record of mathematical problems first solved with AI in the loop, live since 20 July 2026.

137 of our records carry an `ids.external` link to the matching VibeMathed entry — 141 links in all, because their dataset holds two entries for four of the problems and we keep both rather than pick one for them. Matching is on Erdős problem number or exact title, and nothing looser.

**We take the entry slug and nothing else, and their material is not modified.** Their [dataset](https://vibemathed.com/api/dataset) is CC BY 4.0 and copying field values across would be permitted with attribution — we still do not. A status, a significance score and a verification label are editorial judgements their curators made and stand behind, and re-hosting them here would launder someone else's call into a number that looks like ours. Where the two records disagree, a reader should be able to see two projects disagreeing, and that only means something if both did the work independently.

So no field on any ConjectureHub record is derived from a VibeMathed field. In particular:

| Their field | Ours | Relationship |
| --- | --- | --- |
| `renownLangs` | `notability.wikipedia_language_editions` | Both count Wikipedia language editions. Ours is computed from [Wikidata](https://www.wikidata.org) sitelinks on a stated `measured_on` date; theirs was not consulted, and the two disagree — Jacobian conjecture 16 here against their 13, cycle double cover 1 against their 2. |
| `significance` | *(none)* | We have no significance score, by design — it is the one field that could not carry provenance. |
| `solveType`, `verification` | `claims[].type`, `claims[].evidence_tier` | Independently sourced from primary sources and Lean receipts. |

## Lean verification toolchain

| Project | Repository | Role |
| --- | --- | --- |
| comparator | [leanprover/comparator](https://github.com/leanprover/comparator) | Proof checking against canonical statements |
| landrun | [Zouuup/landrun](https://github.com/Zouuup/landrun) | Sandbox for compiling submitted proofs |
| nanoda | [ammkrn/nanoda_lib](https://github.com/ammkrn/nanoda_lib) | Second independent kernel |
| Lean 4 / Mathlib | [leanprover/lean4](https://github.com/leanprover/lean4) | Proof assistant ecosystem |

Pinned versions match [.github/actions/setup-lean/action.yml](../.github/actions/setup-lean/action.yml).

## Platform inspiration

**[EinsteinArena](https://github.com/vinid/einstein-arena)** ([einsteinarena.com](https://einsteinarena.com)) — Agent onboarding patterns (`skill.md`, proof-of-work registration, public read API, discussion threads) inspired ConjectureHub’s agent layer. ConjectureHub is a **separate project**: humans and agents collaborate on a git-backed conjecture index with Lean verification and curator moderation, not a numeric scoring arena.

**[VibeMathed](https://vibemathed.com)** — The idea of giving the corpus a statistics page, and the choice to break it down by field and by what the model contributed, follow their example. The charts on [`/stats`](https://conjecturehub.org/stats/) are our own: hand-rolled SVG in this repository’s own palette, over series computed from our YAML at build time and published at [`/index/series.json`](https://conjecturehub.org/index/series.json). No figure, series or axis is taken from theirs, and we deliberately do not reproduce their significance-weighted and combined-years-open charts, because we hold neither number.

## This project’s code

Application code in this repository is [Apache-2.0](../LICENSE). Conjecture **data** carries mixed licenses via per-field `provenance` — do not assume a single license over the whole corpus.

## Related projects (context only)

| Project | Relationship |
| --- | --- |
| [formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Primary formalization source we ingest |
| [openai/ten-proofs](https://github.com/openai/ten-proofs) | August 2026 Lean certificates; cited in claims, not ingested wholesale |
| [OpenConjecture](https://openconjecture.org) | Different model (LLM proof attempts); not a dependency |

When reusing content, cite the **specific upstream** named in each record’s `provenance` block, not ConjectureHub alone.
