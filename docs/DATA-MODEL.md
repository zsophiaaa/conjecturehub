# Data model

A conjecture record is one YAML file in `conjectures/`, validated against [`schema/conjecture.schema.json`](../schema/conjecture.schema.json). This document explains the reasoning; the schema is authoritative on the details.

## Status is derived, never stored

There is no `status` field and no `solved` boolean. Each record holds an append-only `claims` array, and the label shown on the site is computed from it at build time by [`ingest/src/lib/status.ts`](../ingest/src/lib/status.ts).

Two incidents drove this design.

**October 2025.** An AI lab announced a model had solved ten open Erdős problems. It had actually performed a literature search and surfaced existing published proofs the curator had missed. The announcement was deleted. The root cause was a schema problem: "open" in that database meant "the curator is unaware of a published solution," and the announcement read it as "no solution exists."

**July 2026.** A 216-character counterexample to the Jacobian conjecture was posted to social media and has since been machine-verified in Lean (Mathlib) and Isabelle/HOL. It disproves the conjecture for dimensions three and above; dimension two is still open.

**August 2026.** OpenAI announced ten new results in mathematics and theoretical computer science, each with a Lean 4 certificate ([openai/ten-proofs](https://github.com/openai/ten-proofs)). Unlike the October 2025 incident, these are claimed new proofs — not literature rediscoveries — but they are not peer-reviewed and the formalized statements still need community review.

Any model with a single status field gets all three of these wrong.

## Claims

Each entry in `claims` records one assertion someone made, with:

- **`type`** — `proved`, `disproved`, `counterexample`, `partial`, `independence`, `reformulation`, or `resolved_by_prior_literature`. That last one exists specifically so that "someone proved this" and "someone found the existing proof" are never the same event.
- **`scope`** — which part of the conjecture this settles. Omitting scope on a partial resolution is the most common way to be wrong.
- **`evidence_tier`** — where the result stands in mathematics. Strictly ordered:

  1. `unverified_claim` — someone said so. A rumour with a citation.
  2. `preprint` — a paper exists, unrefereed.
  3. `published` — appeared in a refereed venue.
  4. `community_accepted` — experts in the area endorse it.
  5. `machine_verified` — a proof assistant kernel checked it against our canonical statement.

- **`attestation`** — how *we* know it. `primary` (we cite the paper, preprint or announcement itself), `secondary` (we cite somebody else's report of it — a catalogue row, an encyclopedia category), or `self_checked` (we ran the check and hold the receipt).
- **`state`** — `active`, `disputed` or `retracted`. Claims are never edited or deleted. To withdraw one, set its state and append a new claim that `supersedes` it.
- **`ai_assistance`** — declared, structured, and separate from authorship.
- **`reviewer`** — the named human *here* who read the source and confirmed it says what the claim says. Optional, usually null, and never the upstream curator: they are the source, not our reviewer. Automation may never fill this in.
- **`verification`** — the machine-check receipt. Required for, and only valid at, `self_checked`.

### Standing and attestation are different axes

A proof published in 2002 has the same standing whether we cite the journal or a Wikipedia category. What differs is how much of the chain we have actually seen. Squeezing both into one ladder forces a false choice — either overstate the sourcing to get the standing right, or understate the result to be honest about the sourcing.

This is not hypothetical. The single-axis version produced 712 claims out of 775 carrying an organisation in `reviewer` — "teorth/erdosproblems maintainers", "google-deepmind/formal-conjectures maintainers" — because the field was mandatory above `preprint` and the importer had to write *something*. A mandatory field gets filled whether or not anyone did the work, so the requirement was dropped rather than tightened. Recording that nobody checked, and printing it on the page, beats demanding a name that does not exist.

Most of the corpus is `secondary`, and that is the honest description of a project that indexes other people's catalogues. The site says so on every record rather than letting a tier imply otherwise.

### LLM review is not a tier

There is deliberately no evidence tier for "an LLM read the proof and thought it was fine." The best-performing LLM proof judge measured in 2026 passes 38% of proofs that human experts judge flawed, and the characteristic failure is that the judge mentally repairs a gap and then credits it. LLMs in this system triage, summarize and route. They do not promote claims.

## `openness_basis`

Records *why* we believe something is open and *on whose authority*. The default, `no_published_solution_known_to_curator`, is the honest one and means exactly what it says. The site renders this caveat on every unsolved page rather than burying it in an FAQ.

## `ids` — the crosswalk

The reason this project has a reason to exist. One conjecture may be an Erdős number, a Lean file path, a Wikidata QID, a set of OEIS sequences, a Wikipedia article and several arXiv papers. Almost nothing links them. Seeding resolves these by problem number where an explicit key exists and by normalized name otherwise; normalization strips diacritics, case and a leading "the", and matches against aliases as well as titles.

## `provenance`

Per-field attribution with an SPDX license identifier and the upstream version. Not per-file, because a single record routinely mixes an Apache-2.0 statement, a CC0 identifier and a CC BY-SA alias. Validation rejects statement text that arrives without a provenance entry covering it.

## Formal statements are the real trusted base

A `machine_verified` claim guarantees that the submitted proof proves *our* canonical statement. It says nothing about whether our statement expresses the conjecture correctly. An audit of five widely-used formalization benchmarks found 398 mechanically certified defects — vacuous theorems, missing hypotheses, mistranslated domains.

So each entry in `statement.formal` carries `reviewed_by`, and an unreviewed statement must not gate a verified proof. Entries also carry `definition_hole`, which flags challenges that ask the solver to supply a definition. Those are auto-gameable — define the hole to be the conjecture and close it with `rfl` — and always require a human.
