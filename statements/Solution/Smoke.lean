/-
Reference solution to the smoke-test challenge. Kept in the repository so the
verification workflow has something known-good to check itself against.

Touching this file is how you exercise the verifier: `select-challenges.sh`
picks a challenge only when its solution file changes, so a pull request editing
this comment runs the whole chain — elan, landrun, nanoda, lean4export and
comparator — against a proof whose outcome is already known.
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.Smoke

theorem smoke_prime_above_1000 : ∃ p : ℕ, Nat.Prime p ∧ 1000 < p :=
  ⟨1009, by norm_num, by norm_num⟩

end Challenge.Smoke
