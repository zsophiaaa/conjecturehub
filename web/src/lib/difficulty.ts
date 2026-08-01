/**
 * The controlled vocabulary for community difficulty tags. We deliberately do
 * not use a single numeric scale: mathematicians describe why a problem is hard
 * in kind, not degree ("needs a new idea" is different from "just technical").
 * Tags aggregate into counts per conjecture, so the vocabulary must be closed —
 * a free-text field would fragment into synonyms and never aggregate.
 *
 * Adding a tag here is the only way to introduce a new one; submissions with an
 * unknown slug are rejected server-side.
 */
export interface DifficultyTag {
  slug: string;
  label: string;
  description: string;
}

export const DIFFICULTY_TAGS: readonly DifficultyTag[] = [
  {
    slug: "needs-new-idea",
    label: "Needs a new idea",
    description: "No known approach seems to work; a genuinely new technique looks required.",
  },
  {
    slug: "technical",
    label: "Technical",
    description: "The path is plausibly clear, but the execution is long or delicate.",
  },
  {
    slug: "famous-hard",
    label: "Famously hard",
    description: "A well-known problem that has resisted sustained effort by many.",
  },
  {
    slug: "elementary-statement",
    label: "Elementary to state",
    description: "Understandable with little background, whatever the difficulty of proof.",
  },
  {
    slug: "computational",
    label: "Computational angle",
    description: "Progress may come from computation, search, or verified computation.",
  },
  {
    slug: "approachable",
    label: "Approachable",
    description: "Partial results or special cases look within reach of a determined effort.",
  },
  {
    slug: "foundational",
    label: "Foundational",
    description: "A resolution would reshape or unlock a broad area.",
  },
  {
    slug: "well-defined",
    label: "Well-defined",
    description: "The statement is precise and unambiguous as given.",
  },
] as const;

const BY_SLUG = new Map(DIFFICULTY_TAGS.map((t) => [t.slug, t]));

export function isDifficultyTag(slug: string): boolean {
  return BY_SLUG.has(slug);
}

export function difficultyLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}
