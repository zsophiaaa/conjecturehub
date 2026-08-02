import type { Claim, Conjecture } from "@/lib/corpus";

function isDiscussionClaim(claim: Claim): boolean {
  return claim.source.kind === "forum" || claim.source.kind === "reddit";
}

export function ForumDiscussionSummary({ conjecture }: { conjecture: Conjecture }) {
  const forumClaims = [...(conjecture.claims ?? [])]
    .filter(isDiscussionClaim)
    .sort((a, b) => (b.asserted_on ?? b.recorded_on).localeCompare(a.asserted_on ?? a.recorded_on));

  const note = conjecture.openness_basis?.note?.trim();
  if (forumClaims.length === 0 && !note) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">Forum discussion summary</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Summarized from linked threads — not a full mirror. See claim history for full citations.
        </p>
      </div>

      {note ? (
        <div className="ui-panel border-l-4 border-accent px-4 py-3 text-sm leading-relaxed text-ink">
          {note}
        </div>
      ) : null}

      {forumClaims.length > 0 ? (
        <ul className="ui-panel divide-y divide-border">
          {forumClaims.map((claim) => (
            <li key={claim.id} className="px-4 py-3">
              <p className="font-medium text-ink">
                {claim.authors?.length ? claim.authors.join(", ") : "Forum contributor"}
                {claim.asserted_on ? (
                  <span className="ml-2 font-normal text-ink-faint">· {claim.asserted_on}</span>
                ) : null}
              </p>
              {claim.notes ? (
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{claim.notes}</p>
              ) : null}
              {claim.source.quote ? (
                <blockquote className="mt-2 border-l-2 border-border-strong pl-3 text-sm italic text-ink-faint">
                  {claim.source.quote}
                </blockquote>
              ) : null}
              <p className="mt-2 text-xs">
                <a href={claim.source.url}>{claim.source.title ?? claim.source.url}</a>
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
