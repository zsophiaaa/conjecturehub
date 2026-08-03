import type { Attestation, Claim, Conjecture, EvidenceTier } from "../types.js";

/**
 * Status is derived, never stored. A conjecture file records what people have
 * claimed and how strong the evidence is; the label you see on the site is
 * computed from that every build.
 */

export const TIER_ORDER: EvidenceTier[] = [
  "unverified_claim",
  "preprint",
  "published",
  "community_accepted",
  "machine_verified",
];

export function tierRank(tier: EvidenceTier): number {
  return TIER_ORDER.indexOf(tier);
}

export type StatusKey =
  | "open"
  | "claimed"
  | "disputed"
  | "partially_resolved"
  | "resolved_by_prior_literature"
  | "proved"
  | "disproved"
  | "independent";

export interface DerivedStatus {
  key: StatusKey;
  label: string;
  /** Strongest evidence tier among the claims that produced this label. */
  tier: EvidenceTier | null;
  /** How we know the claim that produced this label. Orthogonal to `tier`. */
  attestation: Attestation | null;
  /** True when the resolution only covers part of the conjecture. */
  scoped: boolean;
  scope: string | null;
  /** Plain-language caveat shown next to the label. Never omit this. */
  caveat: string;
  /** Claim that determined the label, if any. */
  decidedBy: string | null;
}

const RESOLVING_TYPES = new Set(["proved", "disproved", "counterexample", "independence"]);

function strongest(claims: Claim[]): Claim | null {
  let best: Claim | null = null;
  for (const c of claims) {
    if (!best || tierRank(c.evidence_tier) > tierRank(best.evidence_tier)) best = c;
  }
  return best;
}

const OPEN_CAVEATS: Record<Conjecture["openness_basis"]["meaning"], string> = {
  no_published_solution_known_to_curator:
    "Open only in the sense that the cited curator is unaware of a published solution. That is not the same as no solution existing — search the literature before investing effort.",
  no_solution_known_to_community:
    "No solution is known to the research community as far as our sources report. Still not a proof that none exists.",
  proven_undecidable: "Proven undecidable in the stated axiom system.",
  unknown: "We have no reliable basis for a status here yet.",
};

/**
 * What the tier says about the result, and nothing about how we know it. The
 * second half of that sentence is `attestationCaveat`, and keeping them apart
 * is the point: this used to end at "Reviewed by a named human, not
 * machine-checked", which the site printed over 713 claims whose entire basis
 * was a row in somebody else's catalogue.
 */
const STANDING_CAVEATS: Record<EvidenceTier, string> = {
  machine_verified:
    "A proof assistant kernel checked this proof against our canonical statement. That guarantees the proof is correct, not that our statement says what you think it says.",
  unverified_claim: "Someone has claimed a resolution and nobody has refereed it.",
  preprint: "Based on a preprint that has not been refereed.",
  published: "The result is published in the literature.",
  community_accepted: "The result is accepted by the research community.",
};

/** How we know it, in the reader's terms. */
function attestationCaveat(claim: Claim): string {
  switch (claim.attestation) {
    case "self_checked":
      return "";
    case "primary":
      return claim.reviewer
        ? `We cite the source itself, read and confirmed by ${claim.reviewer}.`
        : "We cite the source itself, but nobody here has confirmed it says this.";
    case "secondary":
      return "We are relaying someone else's report of it and have not seen the proof — follow the source before you rely on this.";
  }
}

export function deriveStatus(conjecture: Conjecture): DerivedStatus {
  const claims = conjecture.claims ?? [];
  const active = claims.filter((c) => c.state === "active");
  const disputed = claims.filter((c) => c.state === "disputed");

  const openCaveat = OPEN_CAVEATS[conjecture.openness_basis.meaning];

  if (active.length === 0) {
    if (disputed.length > 0) {
      return {
        key: "disputed",
        label: "Disputed",
        tier: strongest(disputed)?.evidence_tier ?? null,
        attestation: strongest(disputed)?.attestation ?? null,
        scoped: false,
        scope: null,
        caveat:
          "A resolution was claimed and is contested. Nothing here should be read as settled while this stands.",
        decidedBy: strongest(disputed)?.id ?? null,
      };
    }
    return {
      key: "open",
      label: "Open",
      tier: null,
      attestation: null,
      scoped: false,
      scope: null,
      caveat: openCaveat,
      decidedBy: null,
    };
  }

  // A literature-lookup result is not a new proof. Keeping these separate is the
  // whole reason the October 2025 Erdos announcement went wrong.
  const literature = active.filter((c) => c.type === "resolved_by_prior_literature");
  const resolving = active.filter((c) => RESOLVING_TYPES.has(c.type));
  const partial = active.filter((c) => c.type === "partial");

  if (resolving.length > 0) {
    const top = strongest(resolving)!;
    const scoped = Boolean(top.scope);
    const key: StatusKey =
      top.type === "proved"
        ? "proved"
        : top.type === "independence"
          ? "independent"
          : "disproved";

    const label =
      top.evidence_tier === "machine_verified"
        ? top.type === "proved"
          ? "Proved (machine-verified)"
          : "Disproved (machine-verified)"
        : top.evidence_tier === "unverified_claim"
          ? "Resolution claimed (unverified)"
          : top.type === "proved"
            ? "Proved"
            : top.type === "independence"
              ? "Independent"
              : "Disproved";

    let caveat = `${STANDING_CAVEATS[top.evidence_tier]} ${attestationCaveat(top)}`.trim();

    if (scoped) {
      caveat = `This resolution covers ${top.scope} only; the rest remains open. ${caveat}`;
    }
    if (disputed.length > 0) {
      caveat = `${caveat} A competing or withdrawn claim also exists — see the timeline.`;
    }

    return {
      key,
      label: scoped ? `${label}, in part` : label,
      tier: top.evidence_tier,
      attestation: top.attestation,
      scoped,
      scope: top.scope ?? null,
      caveat,
      decidedBy: top.id,
    };
  }

  if (literature.length > 0) {
    const top = strongest(literature)!;
    return {
      key: "resolved_by_prior_literature",
      label: "Already solved in the literature",
      tier: top.evidence_tier,
      attestation: top.attestation,
      scoped: Boolean(top.scope),
      scope: top.scope ?? null,
      caveat:
        "This was listed as open, but a published solution already existed and was later found. No new mathematics was produced by finding it. " +
        attestationCaveat(top),
      decidedBy: top.id,
    };
  }

  if (partial.length > 0) {
    const top = strongest(partial)!;
    return {
      key: "partially_resolved",
      label: "Partial progress",
      tier: top.evidence_tier,
      attestation: top.attestation,
      scoped: true,
      scope: top.scope ?? null,
      caveat: `Progress has been made but the conjecture is not settled. ${openCaveat}`,
      decidedBy: top.id,
    };
  }

  const top = strongest(active)!;
  return {
    key: "claimed",
    label: "Claim recorded",
    tier: top.evidence_tier,
    attestation: top.attestation,
    scoped: Boolean(top.scope),
    scope: top.scope ?? null,
    caveat:
      `A claim has been recorded but it does not resolve the conjecture. ${openCaveat} ` +
      attestationCaveat(top),
    decidedBy: top.id,
  };
}
