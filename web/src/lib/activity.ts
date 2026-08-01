import { db } from "@/db";
import { activityEvents } from "@/db/schema";

export async function logActivity(
  eventType: string,
  opts: { conjectureId?: string; userId?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await db.insert(activityEvents).values({
    eventType,
    conjectureId: opts.conjectureId ?? null,
    userId: opts.userId ?? null,
    metadata: opts.metadata ?? null,
  });
}
