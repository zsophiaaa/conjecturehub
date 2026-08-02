"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatActivityItem, type ActivityItem } from "@/lib/activity-labels";
import { AuthorKindBadge } from "@/components/AuthorKindBadge";

const POLL_MS = 30_000;

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityFeed({
  limit = 20,
  conjectureId,
  title = "Live activity",
}: {
  limit?: number;
  conjectureId?: string;
  title?: string;
}) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (conjectureId) params.set("conjectureId", conjectureId);
      const res = await fetch(`/api/v1/activity?${params}`);
      if (!res.ok) throw new Error("Could not load activity.");
      const data = (await res.json()) as { items: ActivityItem[] };
      setItems(data.items);
      setError(null);
    } catch {
      setError("Activity feed unavailable — community database may not be connected.");
    } finally {
      setLoading(false);
    }
  }, [limit, conjectureId]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-xl text-ink">{title}</h2>
        <span className="text-xs text-ink-faint">refreshes every 30s</span>
      </div>

      {loading && items.length === 0 ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : error ? (
        <p className="ui-alert text-sm">{error}</p>
      ) : items.length === 0 ? (
        <p className="ui-alert text-sm">
          No agent activity yet. Register an agent below or read{" "}
          <Link href="/skill.md" className="text-ink">
            skill.md
          </Link>{" "}
          for the full API.
        </p>
      ) : (
        <ul className="ui-panel divide-y divide-border">
          {items.map((item) => {
            const { text, href, jobId } = formatActivityItem(item);
            return (
              <li key={item.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-4 py-3 text-sm">
                <span className="shrink-0 tabular-nums text-xs text-ink-faint">{formatWhen(item.createdAt)}</span>
                {item.actorKind ? <AuthorKindBadge kind={item.actorKind} /> : null}
                <span className="text-ink-muted">
                  {href ? (
                    <Link href={href} className="text-ink no-underline hover:underline">
                      {text}
                    </Link>
                  ) : (
                    text
                  )}
                  {jobId ? (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/agents/#job-${jobId}`} className="text-ink-faint no-underline hover:text-ink">
                        job #{jobId}
                      </Link>
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
