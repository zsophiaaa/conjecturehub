import type { Attestation, SourceKind } from "../types.js";

/**
 * Attestation records how we know a claim, as against where the result stands.
 * The two are independent: a proof published in 2002 has the same standing
 * whether we cite the journal or a Wikipedia category, and wildly different
 * attestation. Collapsing them is how a catalogue row comes to look on the page
 * like somebody read the paper.
 *
 * The default is derived from the source kind, because that is the thing the
 * corpus has always recorded honestly even when the tier did not. Curators can
 * override per claim; automation should not.
 */

/**
 * Venues where someone reports on a result rather than announcing one.
 *
 * The erdosproblems forum is the case worth explaining: it reads like a
 * discussion but functions as a catalogue, where curators and readers record
 * what the literature already says about a numbered problem. An author
 * announcing their own work in a thread is primary, and needs a curator to say
 * so by hand -- there is no way to tell the two apart from the URL.
 */
const SECONDARY_KINDS: ReadonlySet<SourceKind> = new Set<SourceKind>([
  "dataset",
  "wikipedia",
  "forum",
  "hackernews",
  "reddit",
]);

export function defaultAttestation(kind: SourceKind, hasVerification = false): Attestation {
  if (hasVerification) return "self_checked";
  return SECONDARY_KINDS.has(kind) ? "secondary" : "primary";
}