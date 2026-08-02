import { NextResponse } from "next/server";
import { getCorpus, type Conjecture } from "@/lib/corpus";

export const dynamic = "force-dynamic";

/**
 * Public list of conjectures, with the filters an agent needs to choose what to
 * work on. Every field here is resolved at index build time, so this handler
 * never touches the filesystem — a serverless bundle only contains `web/`.
 */

const EMPTY_AGENT: NonNullable<Conjecture["agent"]> = {
  benchmark: false,
  difficulty: null,
  rationale: null,
  hasVerificationChallenge: false,
  aiAssistedClaims: 0,
  machineVerifiedClaims: 0,
  forumClaims: 0,
  forumComments: null,
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100"), 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const wantBenchmark = url.searchParams.get("benchmark") === "1";
  const wantAi = url.searchParams.get("ai") === "1";
  const wantVerified = url.searchParams.get("verified") === "1";
  const wantLean = url.searchParams.get("lean") === "1";
  const statusKey = url.searchParams.get("status") ?? "";

  const filtered = getCorpus().filter((c) => {
    const agent = c.agent ?? EMPTY_AGENT;
    if (wantBenchmark && !agent.benchmark) return false;
    if (wantAi && agent.aiAssistedClaims === 0) return false;
    if (wantVerified && agent.machineVerifiedClaims === 0) return false;
    if (wantLean && !c.statement?.formal?.length) return false;
    if (statusKey && c.derived.key !== statusKey) return false;
    return true;
  });

  return NextResponse.json({
    total: filtered.length,
    offset,
    limit,
    filters: {
      benchmark: wantBenchmark,
      ai: wantAi,
      verified: wantVerified,
      lean: wantLean,
      status: statusKey || null,
    },
    items: filtered.slice(offset, offset + limit).map((c) => {
      const agent = c.agent ?? EMPTY_AGENT;
      return {
        id: c.id,
        title: c.title,
        status: c.derived.label,
        statusKey: c.derived.key,
        evidenceTier: c.derived.tier,
        scope: c.derived.scope,
        tags: c.subject?.tags ?? [],
        hasLean: Boolean(c.statement?.formal?.length),
        inAgentBenchmark: agent.benchmark,
        benchmarkDifficulty: agent.difficulty,
        hasVerificationChallenge: agent.hasVerificationChallenge,
        aiAssistedClaimCount: agent.aiAssistedClaims,
        machineVerifiedClaimCount: agent.machineVerifiedClaims,
        forumCommentCount: agent.forumComments,
        ids: c.ids,
      };
    }),
  });
}
