import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { verificationJobs } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Webhook for GitHub Actions to report Lean verification outcomes.
 * Authenticated with CRON_SECRET (same pattern as sweep workflows).
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await req.json()) as {
    jobId?: number;
    status?: string;
    outcome?: string;
    elapsedSeconds?: number;
    logUrl?: string;
    workflowRunId?: string;
  };

  if (!body.jobId) {
    return NextResponse.json({ error: "jobId required." }, { status: 400 });
  }

  const allowed = new Set([
    "pending",
    "running",
    "verified",
    "rejected",
    "failed",
    "exceeded_budget",
  ]);
  if (!body.status || !allowed.has(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  await db
    .update(verificationJobs)
    .set({
      status: body.status as typeof verificationJobs.$inferInsert.status,
      outcome: body.outcome ?? null,
      elapsedSeconds: body.elapsedSeconds ?? null,
      logUrl: body.logUrl ?? null,
      workflowRunId: body.workflowRunId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(verificationJobs.id, body.jobId));

  return NextResponse.json({ ok: true });
}
