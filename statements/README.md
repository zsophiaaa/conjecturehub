# Canonical statements

This is the trusted base of the whole verification story. A machine-verified claim says *the kernel accepted a proof of the statement in this directory* — nothing more. If a statement here does not mean what its name suggests, a perfectly valid proof will certify the wrong thing.

That is not hypothetical. An audit of five widely-used formalization benchmarks found 398 mechanically certified defects: vacuous theorems, missing hypotheses, domains mistranslated from the informal statement. So statements are reviewed separately from proofs, and each one records its reviewer in the conjecture record.

## Layout

```
statements/
  lean-toolchain          Lean v4.32.0, matching the Mathlib tag below
  lakefile.toml           only lean_lib targets — see the warning below
  Challenge/<Name>.lean   canonical statements, ending in `sorry`
  Solution/<Name>.lean    submitted proofs
  challenges/<name>.json  which theorem is being challenged, and under what rules
  verify.sh               runs comparator on one challenge
```

## Adding a challenge

1. Write `Challenge/YourThing.lean`. Prefer copying an existing reviewed formalization verbatim (formal-conjectures is Apache-2.0) over paraphrasing one — a paraphrase is a new, unreviewed statement.
2. Keep `set_option autoImplicit false`. Without it a typo in a binder silently becomes a fresh universe-polymorphic variable, which is exactly how a statement ends up weaker than it looks.
3. End the theorem with `sorry`.
4. Add `challenges/your-thing.json` pointing at the module, the theorem name, and the conjecture id it corresponds to.
5. Get it reviewed by a human and record them in `statement.formal[].reviewed_by` on the conjecture.

## Adding a proof

Add `Solution/YourThing.lean` proving the same theorem. Do not touch anything else in this directory — CI restores every other file from the base commit, so edits to the challenge, the lakefile or `verify.sh` are silently discarded.

Your proof may depend on no axioms beyond `propext`, `Quot.sound` and `Classical.choice`. That means no `sorry`, no `native_decide`, no `@[implemented_by]`, no custom axioms.

## Two things that will bite you

**Only `lean_lib` targets belong in `lakefile.toml`.** Adding a single `lean_exe` makes Lake build native `.o` files for the whole of Mathlib, turning a cached five-minute job into an uncached multi-hour one.

**The allowlist is an allowlist for a reason.** Blocking axiom names by pattern does not work: since Lean 4.29 every `native_decide` call emits a uniquely-named axiom, so there is no fixed list to block. Text-level filtering does not work either — a submission to one benchmark got an axiom past a source-text filter by assembling its name through string concatenation. Enumerating what is permitted is the only approach that holds.

## Running it locally

You need Linux, plus `landrun` built from main, `lean4export` matching your Lean version, and optionally `nanoda_bin`, all on `PATH`. Then:

```bash
cd statements
lake exe cache get
lake build Challenge          # never plain `lake build`: it would compile solutions too
./verify.sh smoke /tmp/result.json
```

`smoke` is a pipeline self-test, not a conjecture. It checks that verification works before anyone relies on it for a real result.

Exit codes are `0` verified, `1` rejected, `2` exceeded the time budget, `3` setup problem. The budget outcome is neither a pass nor a fail: the median real verification takes about 96 seconds, but roughly one in sixteen runs past ten minutes, and reporting a slow proof as wrong would be a lie.
