# Licensing of the conjecture data

The data in this directory is **not under a single license**, and we do not pretend otherwise.

Upstream sources fragment across Apache-2.0, CC BY-SA, CC0 and, in some cases, terms that forbid redistributing the statement text at all. Rather than declaring one license over the whole corpus and hoping, every record carries a `provenance` array recording which fields came from where, under what license, and at which upstream version.

Before reusing anything here, read the `provenance` block of the specific records you intend to use.

The repository's own code is MIT. That licence stops at this directory and has no bearing on anything below.

## Where the problems come from

Counts are provenance entries currently in the corpus, not records — one record usually cites several sources.

| Source | License | Entries | What we take |
| --- | --- | --- | --- |
| [teorth/erdosproblems](https://github.com/teorth/erdosproblems) | Apache-2.0 | 1,217 | Problem numbers, status, OEIS crosswalks, tags |
| [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Apache-2.0 | 812 | Titles, informal statements from docstrings, Lean theorem names, MSC codes, reference links |
| [Wikidata](https://www.wikidata.org) | CC0-1.0 | 282 | QIDs, labels, aliases, Wikipedia and MathWorld links, sitelink counts |
| [Wikipedia](https://en.wikipedia.org) | CC-BY-SA-4.0 | 157 | Category-derived status, article links |
| [VibeMathed](https://vibemathed.com) | CC-BY-4.0 | 137 | Crosswalk identifiers linking our records to theirs |
| erdosproblems.com forum, curator notes, announcements | CC0-1.0 | 21 | Summaries with links, never full text |

**CC-BY-SA-4.0 is share-alike.** The 157 Wikipedia-derived entries carry that obligation with them wherever they go, and no licence chosen for the code changes it. If you redistribute those fields, your derivative of them is share-alike too.

Live sources the sweep adds to continuously — arXiv, MathOverflow, Hacker News, Reddit, Mastodon, GitHub — supply claim metadata and short quotes under each venue's own terms, recorded per claim in `source`. We store metadata and a quotation, never a paper.

Upstream flags a caveat we inherit and pass on: individual conjectures in formal-conjectures may carry third-party terms of their own. Material originating from Wikipedia, MathOverflow or OEIS is CC BY-SA 4.0; material derived from arXiv papers follows each paper's own license.

## What we deliberately do not store

- **Statement text from erdosproblems.com.** The metadata database is Apache-2.0; the prose statements on the website are not ours to copy. Records sourced only from there have `statement.informal: null` and link out.
- **Post content from X.** See the note in the README.
- **Full text of arXiv papers.** We store metadata and link to the source.

## Contributing data

By opening a pull request that adds or edits a record, you confirm that you have the right to contribute the content under a license compatible with the `provenance` entry you supply, and that you have supplied one. Pull requests that add statement text without provenance will fail validation.
