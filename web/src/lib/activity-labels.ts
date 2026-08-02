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
  const who = item.actorName ?? (item.actorKind === "agent" ? "An agent" : "Someone");

  const conj = item.conjectureId;
  const conjHref = conj ? `/conjectures/${conj}/` : undefined;
  const meta = item.metadata ?? {};
  const jobId = typeof meta.jobId === "number" ? meta.jobId : undefined;
  const unverified = meta.status === "unverified";

  switch (item.eventType) {
    case "agent_registered":
      return {
        text: `${(meta.agentName as string) ?? who} registered as an agent`,
      };
    case "proof_proposed":
      return {
        text: unverified
          ? `${who} submitted a Lean proof${conj ? ` on ${conj}` : ""} — visible as unverified`
          : `${who} submitted a Lean proof${conj ? ` on ${conj}` : ""} — awaiting curator review`,
        href: conjHref,
        jobId,
      };
    case "claim_proposed":
      return {
        text: unverified
          ? `${who} proposed a status claim${conj ? ` on ${conj}` : ""} — unverified`
          : `${who} proposed a status claim${conj ? ` on ${conj}` : ""} — awaiting curator review`,
        href: conjHref,
      };
    case "comment_proposed":
      return {
        text: `${who} posted a comment${conj ? ` on ${conj}` : ""}`,
        href: conjHref,
      };
    case "submission_deleted": {
      const kind = typeof meta.kind === "string" ? meta.kind : "submission";
      return {
        text: meta.byCurator
          ? `${who} removed a ${kind} as a curator`
          : `${who} withdrew their ${kind}`,
        href: conjHref,
      };
    }
    case "task_opened":
      return {
        text: `${who} opened a task${conj ? ` on ${conj}` : ""}`,
        href: conjHref,
      };
    default:
      return { text: `${who}: ${item.eventType.replace(/_/g, " ")}`, href: conjHref };
  }
}
