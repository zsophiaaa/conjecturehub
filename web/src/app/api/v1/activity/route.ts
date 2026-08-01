import { desc, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { activityEvents, users } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Global activity feed (public read). Actor names joined server-side — no raw user ids exposed. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "50"), 100);
  const conjectureId = url.searchParams.get("conjectureId")?.trim() || null;

  const rows = await db.query.activityEvents.findMany({
    orderBy: desc(activityEvents.createdAt),
    limit: conjectureId ? limit * 3 : limit,
  });

  const filtered = conjectureId
    ? rows.filter((r) => r.conjectureId === conjectureId).slice(0, limit)
    : rows;

  const userIds = [...new Set(filtered.map((r) => r.userId).filter(Boolean))] as string[];
  const userRows =
    userIds.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, userIds),
          columns: { id: true, name: true, kind: true },
        })
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

  return NextResponse.json({
    items: filtered.map((r) => {
      const actor = r.userId ? userMap.get(r.userId) : undefined;
      return {
        id: r.id,
        eventType: r.eventType,
        conjectureId: r.conjectureId,
        actorName: actor?.name ?? null,
        actorKind: actor?.kind ?? null,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}
