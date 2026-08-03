# ConjectureHub

A living index of every mathematical conjecture we can find, and who has proved what.

The database is this git repository. Every conjecture is a YAML file in [`conjectures/`](conjectures/), every change is a commit, every contribution is a pull request, and CI is the reviewer. When someone submits a Lean proof, the merge button is gated on a proof assistant kernel actually checking it — so a merged proof is a verified proof, not a claimed one.

## Why this exists

Conjecture data is scattered and none of it is joined up. The same problem exists as an erdosproblems.com number, a Lean file in DeepMind's formal-conjectures, a Wikidata QID, an OEIS sequence and an arXiv paper, and almost nothing links them. Meanwhile formal-conjectures deliberately does not host proofs — it stores a pointer to whoever's personal repository has one. Nobody hosts the join between a conjecture and its proof.

## The one thing to understand about status

There is no `solved` boolean anywhere in this repository, and that is deliberate.

In October 2025 an AI lab announced that a model had solved ten open Erdős problems. It had not. It had run a literature search and found existing published proofs that the database curator had not catalogued. The curator's own definition of "open" was "I am personally unaware of a paper solving this."

So every record here stores an append-only list of **claims**, each with a source, a date, a scope, and an evidence tier. The status you see on the site is computed from those claims at build time. `resolved_by_prior_literature` is a distinct claim type from `proved`, because finding an existing proof and producing a new one are different events.

Scope matters too. The Jacobian conjecture is currently false for dimensions three and up and open in dimension two. A single status field cannot say that; a list of scoped claims can.

Read [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) for the details.

## Layout

| Path | What it is |
| --- | --- |
| `conjectures/` | The database. One YAML file per conjecture. |
| `schema/` | JSON Schema for a conjecture record. Enforced on every pull request. |
| `statements/` | Canonical Lean statements that submitted proofs are checked against. |
| `ingest/` | TypeScript for seeding the corpus, sweeping sources, and building the site index. |
| `web/` | The website. |
| `.github/workflows/` | Validation, the scheduled sweep, and Lean verification. |

## Running it

```bash
npm install
npm run seed          # rebuild the corpus from upstream sources
npm run validate      # check every conjecture file
npm run build:index   # generate the search index for the site
npm run dev           # run the site locally
```

## Sources

The seed corpus merges three permissively-licensed sources:

- [`google-deepmind/formal-conjectures`](https://github.com/google-deepmind/formal-conjectures) (Apache-2.0) — formalized Lean statements, pinned to a tagged release rather than `main`, because formalizations stop compiling within months.
- [`teorth/erdosproblems`](https://github.com/teorth/erdosproblems) (Apache-2.0) — the Erdős problem database, which already carries crosswalks to Lean and OEIS.
- [Wikidata](https://www.wikidata.org) (CC0) — canonical QIDs and the alias table. The Collatz conjecture alone has eight names.

Records also link out to the matching entry on [VibeMathed](https://vibemathed.com) (CC BY 4.0), a community-curated record of problems first solved with AI in the loop. The crosswalk carries the link and nothing else — no status, score or verification label of theirs is reproduced here, so where the two sites disagree you are seeing two projects that did the work separately. See [docs/ATTRIBUTIONS.md](docs/ATTRIBUTIONS.md).

The scheduled sweep watches arXiv, Lean Zulip, Mathstodon, Wikipedia, Hacker News and mathematician blogs. It deliberately does not use the X API: as of February 2026 there is no free tier, reads are billed per post, and scraping X is both a permanent-ban offense under its developer terms and the subject of live CFAA litigation. Announcements made on X reliably surface on the free sources within hours anyway.

## Contributing

Open a pull request. Bots do the same thing, and their PRs get the same checks.

- Adding or correcting a conjecture: edit a file in `conjectures/`. CI validates the schema and screens for junk.
- Recording a claim: append to `claims`. Never edit or delete an existing claim — to withdraw one, set its state to `retracted` and add a new one. The history is the point.
- Submitting a proof: add a Lean solution file. CI checks it with [`leanprover/comparator`](https://github.com/leanprover/comparator) against our canonical statement, with an allowlist of exactly `propext`, `Quot.sound` and `Classical.choice`. If it passes, it merges.

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Licensing

Two different things live in this repository and they are licensed differently.

**The code is [MIT](LICENSE).** Use it, fork it, run it, sell it. Keep the copyright notice and you are done.

**The conjecture data is not MIT, and cannot be**, because it is aggregated from upstream sources that set their own terms. Every record carries a per-field `provenance` block naming the source, the SPDX identifier and the date it was retrieved, so the licence question is answerable per field rather than by guessing. Across the corpus today:

| Source | Upstream licence | Provenance entries |
| --- | --- | --- |
| [teorth/erdosproblems](https://github.com/teorth/erdosproblems) | Apache-2.0 | 1,217 |
| [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Apache-2.0 | 812 |
| [Wikidata](https://www.wikidata.org) | CC0-1.0 | 282 |
| [Wikipedia](https://en.wikipedia.org) | CC-BY-SA-4.0 | 157 |
| [VibeMathed](https://vibemathed.com) | CC-BY-4.0 | 137 |
| erdosproblems.com forum, curator notes, other | CC0-1.0 | 21 |

CC-BY-SA-4.0 is share-alike and travels with the data whatever this repository's code licence says. Read [`conjectures/LICENSE.md`](conjectures/LICENSE.md) before reusing records, and [`docs/ATTRIBUTIONS.md`](docs/ATTRIBUTIONS.md) for who is owed credit.

ConjectureHub is a name, not just a codebase. The licence covers the code; it grants no rights in the name, and a fork should run under its own.
