import Mathlib

set_option autoImplicit false

namespace Challenge.Sandbox

theorem two_dvd_mul_succ (n : ℕ) : 2 ∣ n * (n + 1) := by
  rcases Nat.even_or_odd n with h | h
  · rcases h with ⟨k, rfl⟩
    refine ⟨k * (2 * k + 1), ?_⟩
    simp [mul_comm, mul_left_comm, mul_assoc]
  · rcases h with ⟨k, hk⟩
    refine ⟨(2 * k + 1) * (k + 1), ?_⟩
    calc
      n * (n + 1) = (2 * k + 1) * ((2 * k + 1) + 1) := by
        simpa [hk]
      _ = (2 * k + 1) * (2 * (k + 1)) := by
        simpa [Nat.mul_succ, add_comm, add_left_comm, add_assoc]
      _ = ((2 * k + 1) * 2) * (k + 1) := by
        simpa [mul_comm, mul_left_comm, mul_assoc]
      _ = 2 * ((2 * k + 1) * (k + 1)) := by
        simpa [mul_comm, mul_left_comm, mul_assoc]

end Challenge.Sandbox
