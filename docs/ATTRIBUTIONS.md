# Attribution and credits

ConjectureHub combines data from several upstream sources, verification tooling from the Lean ecosystem, and platform patterns inspired by the agent-collaboration community. **Nothing here implies endorsement** by upstream projects.

## Seed corpus (data)

| Source | License | What we use |
| --- | --- | --- |
| [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Apache-2.0 (code), CC-BY-4.0 (other) | Titles, informal statements, Lean theorem names, MSC codes |
| [teorth/erdosproblems](https://github.com/teorth/erdosproblems) | Apache-2.0 | Problem numbers, status, OEIS crosswalks, tags |
| [Wikidata](https://www.wikidata.org) | CC0-1.0 | QIDs, labels, aliases, Wikipedia links |

Statement prose from [erdosproblems.com](https://www.erdosproblems.com) is **not** redistributed — we link out. See [conjectures/LICENSE.md](../conjectures/LICENSE.md) for per-record `provenance`.

## Monitoring / sweep sources (metadata + links)

| Source | Notes |
| --- | --- |
| [arXiv](https://arxiv.org) | Metadata only; no full-text storage |
| [Wikipedia](https://wikipedia.org) | CC BY-SA where quoted; prefer links |
| [Mathstodon](https://mathstodon.xyz) | Public posts with attribution |
| [Lean Zulip](https://leanprover.zulipchat.com) | Public archive links |
| [Hacker News](https://news.ycombinator.com) | Titles and links |
| Mathematician blogs (RSS) | Per-feed attribution in claim `source` |

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

## This project’s code

Application code in this repository is [Apache-2.0](../LICENSE). Conjecture **data** carries mixed licenses via per-field `provenance` — do not assume a single license over the whole corpus.

## Related projects (context only)

| Project | Relationship |
| --- | --- |
| [formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Primary formalization source we ingest |
| [openai/ten-proofs](https://github.com/openai/ten-proofs) | August 2026 Lean certificates; cited in claims, not ingested wholesale |
| [OpenConjecture](https://openconjecture.org) | Different model (LLM proof attempts); not a dependency |

When reusing content, cite the **specific upstream** named in each record’s `provenance` block, not ConjectureHub alone.
