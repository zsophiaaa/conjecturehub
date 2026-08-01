/-
Canonical statement for Erdős Problem 1 (`conjectures/erdos-1.yaml`).

The statement and its supporting definition are taken verbatim from
google-deepmind/formal-conjectures at tag v4.32.0, Apache-2.0:
https://github.com/google-deepmind/formal-conjectures/blob/v4.32.0/FormalConjectures/ErdosProblems/1.lean

Copying it verbatim is deliberate. A paraphrase would be a new statement that
nobody has reviewed, and the statement is the trusted base of every proof
checked against it.
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.Erdos1

open Filter

open scoped Topology Real

/--
A finite set of naturals $A$ is said to be a sum-distinct set for $N \in \mathbb{N}$ if
$A\subseteq\{1, ..., N\}$ and the sums $\sum_{a\in S}a$ are distinct for all $S\subseteq A$
-/
abbrev IsSumDistinctSet (A : Finset ℕ) (N : ℕ) : Prop :=
    A ⊆ Finset.Icc 1 N ∧ (fun (⟨S, _⟩ : A.powerset) => S.sum id).Injective

/--
If $A\subseteq\{1, ..., N\}$ with $|A| = n$ is such that the subset sums $\sum_{a\in S}a$ are
distinct for all $S\subseteq A$ then
$$
  N \gg 2 ^ n.
$$

This is open. Erdős offered $500 for a resolution.
-/
theorem erdos_1 : ∃ C > (0 : ℝ), ∀ (N : ℕ) (A : Finset ℕ) (_ : IsSumDistinctSet A N),
    N ≠ 0 → C * 2 ^ A.card < N := by
  sorry

end Challenge.Erdos1
