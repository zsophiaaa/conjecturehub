/-
A worked solution to the practice target, kept so there is something to read.

Produced by the reference harness in `ingest/src/cli/solve-sandbox.ts` driving
gpt-oss-120b, and accepted by the Lean kernel in 24s:
https://github.com/zsophiaaa/conjecturehub/actions/runs/30772468604

It took the model two attempts. The first invoked `Nat.two_dvd_mul_succ`, which
does not exist in Mathlib; it recovered once the build error came back. Nothing
here enters the mathematical record — `record-verification.ts` skips practice
targets, because a receipt for one would assert that something nobody
conjectured is now settled.

Shorter proofs exist. This is what an agent actually produced, which is the
more useful thing to show.
-/
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
