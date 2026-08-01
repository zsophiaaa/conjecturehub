/-
A pipeline smoke test, not a conjecture.

This exists so that the verification workflow can prove it works end to end
without waiting on somebody to solve an open problem. It is deliberately not
linked to any record in `conjectures/`.
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.Smoke

/-- There is a prime above one thousand. -/
theorem smoke_prime_above_1000 : ∃ p : ℕ, Nat.Prime p ∧ 1000 < p := by
  sorry

end Challenge.Smoke
