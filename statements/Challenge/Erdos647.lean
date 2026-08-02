/-
Canonical statement for Erdős Problem 647 (`conjectures/erdos-647.yaml`).

The statement is taken verbatim from google-deepmind/formal-conjectures at tag
v4.32.0, Apache-2.0:
https://github.com/google-deepmind/formal-conjectures/blob/v4.32.0/FormalConjectures/ErdosProblems/647.lean

Copying it verbatim is deliberate. A paraphrase would be a new statement that
nobody has reviewed, and the statement is the trusted base of every proof
checked against it.

Two adaptations, both of the kind `Challenge/Erdos1.lean` also makes:
the namespace is `Challenge.Erdos647` and the import is `Mathlib` rather than
`FormalConjectures.Util.ProblemImports`.

One further adaptation is specific to this problem and worth spelling out.
Upstream states the problem as

    theorem erdos_647 : answer(sorry) ↔ ∃ n > 24, ⨆ m : Fin n, m + σ 0 m ≤ n + 2

where `answer(sorry)` is a formal-conjectures placeholder standing for the
not-yet-known truth value. That placeholder is a macro from
`FormalConjectures.Util.ProblemImports`, and elaborating it here would put a
`sorry` inside the statement itself rather than only in the proof. The
challenge target below is therefore the right-hand side of that iff, character
for character as upstream writes it: the existence assertion Erdős actually
posed, and the one a £25 example would settle.
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.Erdos647

open ArithmeticFunction.sigma

/-- Let $\tau(n)$ count the number of divisors of $n$. Is there some $n > 24$ such that
$$
  \max_{m < n}(m + \tau(m)) \leq n + 2?
$$

This is open. Known solutions are $n \in \{5, 8, 10, 12, 24\}$ (OEIS A087280); Erdős
offered £25 for a larger one. Here `σ 0` is the divisor-counting function $\tau$.
-/
theorem erdos_647 : ∃ n > 24, ⨆ m : Fin n, m + σ 0 m ≤ n + 2 := by
  sorry

/-- The other direction of the same question, stated so it can be submitted against.

`erdos_647` above can only be settled by exhibiting an $n$, which is the £25 outcome
nobody expects. The work actually being done on this problem — verification to $10^{12}$,
the mod-12 partial result, the residue-class reductions — all pushes towards there being
no such $n$, and none of it can be checked against an existence statement. Proving this
theorem answers Erdős's question in the negative, so the challenge config records it as a
disproof rather than a proof. -/
theorem erdos_647_no_larger_example : ¬ ∃ n > 24, ⨆ m : Fin n, m + σ 0 m ≤ n + 2 := by
  sorry

/-- An elementary reformulation of the condition above, in the shifted form the
literature usually searches in: writing $m = n - k$, the maximum over $m < n$ is at most
$n + 2$ exactly when $\tau(n - k) \leq k + 2$ for every $1 \leq k < n$.

This is a proved auxiliary lemma, not part of the challenge. The case $m = 0$ needs no
shift because $\tau(0) = 0$ under Mathlib's `σ 0`. -/
theorem iSup_le_iff_forall_tau_sub_le (n : ℕ) :
    (⨆ m : Fin n, (m : ℕ) + σ 0 m) ≤ n + 2 ↔ ∀ k, 1 ≤ k → k < n → σ 0 (n - k) ≤ k + 2 := by
  rw [ciSup_le_iff' (Finite.bddAbove_range _)]
  constructor
  · intro h k hk1 hkn
    have := h ⟨n - k, by omega⟩
    simp only at this
    omega
  · intro h m
    rcases Nat.eq_zero_or_pos (m : ℕ) with hm | hm
    · simp [hm]
    · have := h (n - m) (by omega) (by omega)
      have hsub : n - (n - (m : ℕ)) = (m : ℕ) := by omega
      rw [hsub] at this
      omega

end Challenge.Erdos647
