# Licensing of the conjecture data

The data in this directory is **not under a single license**, and we do not pretend otherwise.

Upstream sources fragment across Apache-2.0, CC BY-SA, CC0 and, in some cases, terms that forbid redistributing the statement text at all. Rather than declaring one license over the whole corpus and hoping, every record carries a `provenance` array recording which fields came from where, under what license, and at which upstream version.

Before reusing anything here, read the `provenance` block of the specific records you intend to use.

## Sources in the seed corpus

| Source | License | What we take |
| --- | --- | --- |
| [google-deepmind/formal-conjectures](https://github.com/google-deepmind/formal-conjectures) | Apache-2.0 (code), CC-BY-4.0 (other materials) | Titles, informal statements from docstrings, Lean theorem names, MSC codes, reference links |
| [teorth/erdosproblems](https://github.com/teorth/erdosproblems) | Apache-2.0 | Problem numbers, status, OEIS crosswalks, tags |
| [Wikidata](https://www.wikidata.org) | CC0-1.0 | QIDs, labels, aliases, Wikipedia and MathWorld links |

Upstream flags a caveat we inherit and pass on: individual conjectures in formal-conjectures may carry third-party terms of their own. Material originating from Wikipedia, MathOverflow or OEIS is CC BY-SA 4.0; material derived from arXiv papers follows each paper's own license.

## What we deliberately do not store

- **Statement text from erdosproblems.com.** The metadata database is Apache-2.0; the prose statements on the website are not ours to copy. Records sourced only from there have `statement.informal: null` and link out.
- **Post content from X.** See the note in the README.
- **Full text of arXiv papers.** We store metadata and link to the source.

## Contributing data

By opening a pull request that adds or edits a record, you confirm that you have the right to contribute the content under a license compatible with the `provenance` entry you supply, and that you have supplied one. Pull requests that add statement text without provenance will fail validation.
