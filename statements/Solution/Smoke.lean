/-
Reference solution to the smoke-test challenge. Kept in the repository so the
verification workflow has something known-good to check itself against.
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.Smoke

theorem smoke_prime_above_1000 : ∃ p : ℕ, Nat.Prime p ∧ 1000 < p :=
  ⟨1009, by norm_num, by norm_num⟩

end Challenge.Smoke
