/-
Canonical statement for the Jacobian conjecture (`conjectures/jacobian-conjecture.yaml`).

Copied verbatim (modulo namespace and imports) from google-deepmind/formal-conjectures
at tag v4.32.0, Apache-2.0:
https://github.com/google-deepmind/formal-conjectures/blob/v4.32.0/FormalConjectures/Wikipedia/JacobianConjecture.lean
-/
import Mathlib

set_option autoImplicit false

namespace Challenge.JacobianConjecture

open Classical

section Prelims

variable {k : Type*} [CommRing k]
variable {σ τ ι : Type*}

variable (k σ τ) in

abbrev RegularFunction := τ → MvPolynomial σ k

namespace RegularFunction

noncomputable def Jacobian (F : RegularFunction k σ τ) :
    Matrix σ τ (MvPolynomial σ k) :=
  Matrix.of fun i j => MvPolynomial.pderiv i (F j)

noncomputable def comp
    (F : RegularFunction k σ τ) (G : RegularFunction k τ ι) :
    RegularFunction k σ ι :=
  fun (i : ι) ↦ MvPolynomial.bind₁ F (G i)

variable (k σ) in
noncomputable def id : RegularFunction k σ σ := MvPolynomial.X

end RegularFunction

end Prelims

variable {k : Type*} [Field k] [CharZero k]

section Conjecture

open RegularFunction

variable {σ : Type*} [Fintype σ]

/-- The **Jacobian Conjecture**: any regular function whose Jacobian determinant is a
unit has a polynomial inverse. Open in general; counterexamples for `n ≥ 3` were found
July 2026 (Alpöge); dimension two remains open. -/
theorem jacobian_conjecture (F : RegularFunction k σ σ)
    (H : IsUnit F.Jacobian.det) :
    ∃ (G : RegularFunction k σ σ), G.comp F = id k σ ∧
      F.comp G = id k σ := by
  sorry

end Conjecture

end Challenge.JacobianConjecture
