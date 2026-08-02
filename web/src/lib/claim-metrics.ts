import type { Claim, Conjecture } from "@/lib/corpus";

export function activeClaims(conjecture: Conjecture): Claim[] {
  return (conjecture.claims ?? []).filter((c) => c.state === "active");
}

export function aiAssistedClaims(conjecture: Conjecture): Claim[] {
  return activeClaims(conjecture).filter((c) => c.ai_assistance?.used === "yes");
}

export function machineVerifiedClaims(conjecture: Conjecture): Claim[] {
  return activeClaims(conjecture).filter((c) => c.evidence_tier === "machine_verified");
}

export function summarizeAiSystems(claims: Claim[]): string[] {
  const systems = new Set<string>();
  for (const c of claims) {
    for (const s of c.ai_assistance?.systems ?? []) systems.add(s);
  }
  return [...systems];
}
