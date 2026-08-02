import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { ModerationQueue } from "@/components/ModerationQueue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Moderation queue",
  robots: { index: false },
};

/**
 * Curator-only approval queue. Server component: it checks the session role
 * before querying, so a non-curator never sees pending content. The actual
 * approve/reject buttons live in a client subcomponent that calls
 * /api/moderation.
 */
export default async function ModeratePage() {
  const session = await auth();
  const user = session?.user;

  if (!user) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="font-serif text-2xl text-ink">Moderation queue</h1>
        <p className="text-ink-muted">You need to sign in as a curator to view this page.</p>
        <Link href="/signin/" className="ui-btn inline-block no-underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (user.role !== "curator" && user.role !== "admin") {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="font-serif text-2xl text-ink">Moderation queue</h1>
        <p className="text-ink-muted">
          This page is limited to curators. If you believe you should have access, ask an
          administrator to grant you the curator role.
        </p>
        <p>
          <Link href="/conjectures/" className="font-medium">
            ← Back to browsing
          </Link>
        </p>
      </div>
    );
  }

  const {
    getPendingComments,
    getPendingDifficulty,
    getPendingClaims,
    getPendingProofs,
  } = await import("@/lib/moderation");

  let comments;
  let difficulty;
  let claims;
  let proofs;
  try {
    [comments, difficulty, claims, proofs] = await Promise.all([
      getPendingComments(),
      getPendingDifficulty(),
      getPendingClaims(),
      getPendingProofs(),
    ]);
  } catch (err) {
    console.error("moderation queue load failed", err);
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="font-serif text-2xl text-ink">Moderation queue</h1>
        <p className="text-ink-muted">
          Could not load pending items. If this is a fresh deploy, run database migrations on Neon (
          <code className="font-mono text-sm">npm run db:migrate</code> in <code className="font-mono text-sm">web/</code>
          ).
        </p>
      </div>
    );
  }

  const pendingCount = comments.length + difficulty.length + claims.length + proofs.length;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl text-ink">Moderation queue</h1>
        <p className="text-ink-muted">
          Pending community contributions ({pendingCount}). Approve to publish or trigger CI;
          reject to hide. Nothing here is visible to the public until you approve it.
        </p>
      </header>

      <ModerationQueue
        initialComments={comments}
        initialDifficulty={difficulty}
        initialClaims={claims}
        initialProofs={proofs}
      />
    </div>
  );
}
