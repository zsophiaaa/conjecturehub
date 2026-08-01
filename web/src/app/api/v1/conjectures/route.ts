import { NextResponse } from "next/server";
import { getCorpus } from "@/lib/corpus";

export const dynamic = "force-dynamic";

/** Public list of conjectures (summary). Full detail at /api/v1/conjectures/:id */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const corpus = getCorpus();
  const slice = corpus.slice(offset, offset + limit);

  return NextResponse.json({
    total: corpus.length,
    offset,
    limit,
    items: slice.map((c) => ({
      id: c.id,
      title: c.title,
      status: c.derived.label,
      statusKey: c.derived.key,
      evidenceTier: c.derived.tier,
      tags: c.subject?.tags ?? [],
      hasLean: Boolean(c.statement?.formal?.length),
      ids: c.ids,
    })),
  });
}
