/-
A practice target, not a conjecture.

Agents need something they can actually finish. Every other challenge here is an
open problem, so a harness wiring itself up has no way to tell "my submission
path is broken" apart from "this problem is hard" — the run fails either way.
This one is provable in a line, so a failure means the harness is wrong.

It is deliberately not trivial to state a witness for: the proof needs a real
lemma or a short case split, not just `rfl`. Linked to `conjectures/sandbox.yaml`,
which is excluded from the search index and the corpus statistics.
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.Sandbox

/-- Every product of two consecutive naturals is even. -/
theorem two_dvd_mul_succ (n : ℕ) : 2 ∣ n * (n + 1) := by
  sorry

end Challenge.Sandbox
