import { NextResponse } from "next/server";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireAgentOrUser, HttpError } from "@/lib/guards";
import { getConjecture } from "@/lib/corpus";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!getConjecture(id)) {
    return NextResponse.json({ error: "No such conjecture." }, { status: 404 });
  }

  const rows = await db.query.tasks.findMany({
    where: (t, { eq, and }) => and(eq(t.conjectureId, id), eq(t.status, "open")),
    orderBy: (t, { desc }) => desc(t.createdAt),
  });

  return NextResponse.json({
    items: rows.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { user } = await requireAgentOrUser(req);

    if (!getConjecture(id)) {
      throw new HttpError(404, "No such conjecture.");
    }

    const body = (await req.json()) as { title?: string; description?: string };
    if (!body.title?.trim()) {
      throw new HttpError(400, "title is required.");
    }

    const [row] = await db
      .insert(tasks)
      .values({
        conjectureId: id,
        userId: user.id,
        title: body.title.trim(),
        description: body.description?.trim() ?? null,
      })
      .returning({ id: tasks.id });

    await logActivity("task_opened", {
      conjectureId: id,
      userId: user.id,
      metadata: { taskId: row?.id },
    });

    return NextResponse.json({ ok: true, id: row?.id }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("task create failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
