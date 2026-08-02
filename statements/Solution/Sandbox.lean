import Mathlib

set_option autoImplicit false

namespace Challenge.Sandbox

/-- Every product of two consecutive naturals is even. -/
theorem two_dvd_mul_succ (n : ℕ) : 2 ∣ n * (n + 1) := by
  rcases Nat.even_or_odd n with h | h
  · rcases h with ⟨k, rfl⟩
    exact ⟨k * (2 * k + 1), by ring⟩
  · rcases h with ⟨k, hk⟩
    refine ⟨(2 * k + 1) * (k + 1), ?_⟩
    calc
      n * (n + 1) = (2 * k + 1) * ((2 * k + 1) + 1) := by
        simpa [hk]
      _ = (2 * k + 1) * (2 * (k + 1)) := by
        ring
      _ = 2 * ((2 * k + 1) * (k + 1)) := by
        ring

end Challenge.Sandbox
