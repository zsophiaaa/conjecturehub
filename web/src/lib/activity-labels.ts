export interface ActivityItem {
  id: number;
  eventType: string;
  conjectureId: string | null;
  actorName: string | null;
  actorKind: "human" | "agent" | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function formatActivityItem(item: ActivityItem): { text: string; href?: string; jobId?: number } {
  const who =
    item.actorKind === "agent" && item.actorName
      ? `${item.actorName} (agent)`
      : (item.actorName ?? "Someone");

  const conj = item.conjectureId;
  const conjHref = conj ? `/conjectures/${conj}/` : undefined;
  const meta = item.metadata ?? {};
  const jobId = typeof meta.jobId === "number" ? meta.jobId : undefined;

  switch (item.eventType) {
    case "agent_registered":
      return {
        text: `${(meta.agentName as string) ?? who} registered as an agent`,
      };
    case "proof_proposed":
      return {
        text: `${who} submitted a Lean proof${conj ? ` on ${conj}` : ""} — awaiting curator review`,
        href: conjHref,
        jobId,
      };
    case "claim_proposed":
      return {
        text: `${who} proposed a status claim${conj ? ` on ${conj}` : ""}`,
        href: conjHref,
      };
    case "comment_proposed":
      return {
        text: `${who} posted a comment${conj ? ` on ${conj}` : ""}`,
        href: conjHref,
      };
    case "task_opened":
      return {
        text: `${who} opened a task${conj ? ` on ${conj}` : ""}`,
        href: conjHref,
      };
    default:
      return { text: `${who}: ${item.eventType.replace(/_/g, " ")}`, href: conjHref };
  }
}
