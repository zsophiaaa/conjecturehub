# Contributing

Everything here happens through pull requests, including the bots'. There is no admin panel and no privileged path — the sweep opens PRs against the same checks you do.

## The one rule

**Claims are append-only.** Never edit or delete an existing entry in a `claims` list. CI diffs your branch against `main` and rejects in-place edits, because the history of who claimed what and when is the product.

To correct a claim:

```yaml
claims:
  - id: some-conjecture-c1
    state: retracted        # the only field you may change on an existing claim
    # ...everything else untouched
  - id: some-conjecture-c2
    supersedes: some-conjecture-c1
    # ...the corrected version
```

## Adding or fixing a conjecture

Edit the relevant file in `conjectures/`, or add a new one. Validate before you push:

```bash
npm run validate
```

New records need at least one identifier or external link — a Wikidata QID, an Erdős number, a Wikipedia article, an OEIS sequence, anything. Without one we cannot tell your submission apart from something already indexed under a different name.

Anything you add to `statement.informal` needs a matching `provenance` entry with an SPDX licence identifier saying where the text came from. If you wrote it yourself, say so and pick a licence. Validation rejects statement text with no provenance.

## Recording a claim

A claim says *someone asserted this*, not *this is true*. Append to `claims`:

```yaml
- id: collatz-conjecture-c3
  type: partial               # proved | disproved | counterexample | partial |
                              # independence | resolved_by_prior_literature | reformulation
  scope: "for n < 2^68"       # omit only if the whole conjecture is settled
  evidence_tier: preprint
  state: active
  asserted_on: 2026-07-19
  recorded_on: 2026-07-31
  source:
    kind: arxiv
    url: https://arxiv.org/abs/2607.12345
    title: "Title of the paper"
    quote: "a short excerpt that supports the claim"
  authors: ["A. Mathematician"]
  ai_assistance:
    used: "no"
  reviewer: null
```

Things that get pull requests sent back:

- **Wrong claim type.** If a search turned up an existing published solution, that is `resolved_by_prior_literature`, not `proved`. This distinction exists because conflating the two produced a public retraction in October 2025.
- **Missing scope.** "Disproved" when you mean "disproved in dimensions three and up" is wrong, and it is the single most common error.
- **Overstated tier.** `published` and `community_accepted` require a named human in `reviewer`, and that human is accountable for the assessment. Automation may never fill it in. If you are not sure, use `unverified_claim`; it is not an insult, it is the honest default.
- **Bare domain sources.** Link the specific paper, post or page.

Set `evidence_tier: machine_verified` only through the verification workflow. A hand-written verification receipt is rejected.

## Submitting a proof

Proofs are checked by a Lean kernel, not by a reviewer's judgement, so a green check really does mean verified.

1. Find the canonical statement in `statements/`. If there is not one for your conjecture, open a pull request adding it first — statements and proofs are reviewed separately, because a statement that does not mean what it looks like would let a correct proof certify the wrong thing.
2. Add your solution as `statements/solutions/<conjecture-id>.lean`. Import the challenge module and prove the target theorem. Do not modify the challenge file; CI rebuilds it from the base commit and ignores your copy.
3. Open a pull request. CI runs [`leanprover/comparator`](https://github.com/leanprover/comparator) in a sandbox.

Your proof must depend on no axioms beyond `propext`, `Quot.sound` and `Classical.choice`. `sorry`, `native_decide`, `@[implemented_by]`, and any other custom axiom will fail the check. This is an allowlist, not a blocklist: since Lean 4.29 each `native_decide` emits a uniquely-named axiom, so blocking known names does not work, and text-level filtering never did — one benchmark submission smuggled an axiom in by assembling its name from string concatenation.

Verification takes about a minute and a half at the median. Roughly one submission in sixteen exceeds ten minutes and is reported as *exceeded budget*, which is neither a pass nor a fail — say so in the pull request and we will rerun with a longer limit.

## If you are an AI agent

You are welcome here, on the same terms as everyone else, plus two:

- **Declare it.** Fill in `ai_assistance` truthfully on every claim you touch. Undeclared AI authorship discovered later gets the claim retracted.
- **You cannot promote a claim.** File at `unverified_claim` and let a human decide. Do not write to `reviewer`. Do not construct a `verification` block — only the verification workflow may do that.

A note on why: the best-performing LLM proof judge measured in 2026 passes 38% of proofs that human experts judge flawed, and its characteristic failure is silently repairing a gap and then crediting it. That is not a reason to keep models out. It is the reason models triage here and kernels verify.

## Running things locally

```bash
npm install
npm run validate      # check every conjecture file
npm run build:index   # compile the corpus for the site
npm run dev           # serve the site
npm run seed          # re-ingest from upstream sources (rarely needed)
npm run sweep         # run the source sweep without writing anything
```

To reproduce the CI screening on your branch:

```bash
npx tsx ingest/src/cli/screen.ts --base origin/main --no-llm
```
