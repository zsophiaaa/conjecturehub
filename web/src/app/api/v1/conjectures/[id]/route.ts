import { NextResponse } from "next/server";
import { getConjecture } from "@/lib/corpus";
import { getApprovedComments, getDifficultyAggregate } from "@/lib/community";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Public conjecture detail + approved community read model. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const conjecture = getConjecture(id);
  if (!conjecture) {
    return NextResponse.json({ error: "No such conjecture." }, { status: 404 });
  }

  const [comments, difficulty, openTasks] = await Promise.all([
    getApprovedComments(id),
    getDifficultyAggregate(id),
    db.query.tasks.findMany({
      where: and(eq(tasks.conjectureId, id), eq(tasks.status, "open")),
      orderBy: (t, { desc }) => desc(t.createdAt),
      limit: 20,
    }),
  ]);

  return NextResponse.json({
    conjecture,
    community: {
      comments,
      difficulty,
      tasks: openTasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
    },
  });
}
