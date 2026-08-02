# Discussion sources (forum, Reddit, etc.)

ConjectureHub records **progress and commentary** from public discussions as append-only `claims` and `ids.external` links. We do **not** mirror whole forum threads.

## Is this allowed?

**Yes, when done this way:**

| Practice | Allowed? |
| --- | --- |
| Link to [erdosproblems.com](https://www.erdosproblems.com) forum threads | Yes — Bloom’s site encourages updates via comments |
| Summarize a comment in a claim `notes` field with author + date | Yes — factual attribution |
| Short excerpt in `source.quote` (1–2 sentences) | Yes — fair use / reference |
| Copy entire threads into our repo | **No** — see [ATTRIBUTIONS.md](./ATTRIBUTIONS.md) |
| Scrape erdosproblems.com for AI training | **No** — respect site operators’ terms |

**erdosproblems.com citation format** (from their forum footer):

> T. F. Bloom, Erdős Problem #N, https://www.erdosproblems.com/N, accessed YYYY-MM-DD.

For a **specific forum comment**, link the thread URL and name the author in `authors` or `notes`.

**Reddit:** Link the post/comment URL; summarize in `notes`. Reddit content is user-generated — attribute the Reddit username, not ConjectureHub.

**teorth/erdosproblems** (Apache-2.0) supplies metadata only, not forum prose.

## How we record discussions

1. **`ids.external`** — stable link, e.g. `erdosproblems.com forum #647`.
2. **`claims[]`** — one entry per substantive contribution:
   - `source.kind`: `forum`, `reddit`, `preprint`, `blog`, etc.
   - `source.url`: permalink
   - `evidence_tier`: usually `unverified_claim` or `preprint` until peer-reviewed
   - `type`: `partial`, `proved`, `disproved`, … as appropriate
   - `state`: `active`, `disputed`, or `retracted` if refuted
   - `authors`: human names when known
   - `ai_assistance`: required disclosure when stated on the forum

3. **Never edit** an old claim — retract and append a correction.

## Curator workflow

Run `npm run sync:erdos-forum` from the repo root to add forum thread links to all Erdős YAML records that lack them. High-value threads still need **hand-curated claims** (start with problems that have partial proofs or heavy discussion).

## Related conjectures

Non-Erdős records (e.g. `jacobian-conjecture`) use the same pattern: link MathOverflow, Reddit, blogs, and X posts as claims with proper `source.kind`.
