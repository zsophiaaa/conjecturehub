import Mathlib

set_option autoImplicit false

namespace Challenge.Sandbox

/-- Every product of two consecutive naturals is even. -/
theorem two_dvd_mul_succ (n : ℕ) : 2 ∣ n * (n + 1) := by
  simpa using Nat.two_dvd_mul_succ n

end Challenge.Sandbox
