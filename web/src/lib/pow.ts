import { createHash } from "node:crypto";

export const POW_DIFFICULTY = 20;

/** Verify proof-of-work for agent registration (leading zero bits). */
export function verifyPow(challenge: string, nonce: number, difficulty = POW_DIFFICULTY): boolean {
  const hash = createHash("sha256").update(`${challenge}${nonce}`).digest("hex");
  const zeros = Math.floor(difficulty / 4);
  const extra = difficulty % 4;
  if (hash.slice(0, zeros) !== "0".repeat(zeros)) return false;
  if (extra > 0 && Number.parseInt(hash[zeros] ?? "f", 16) >= 16 >> extra) return false;
  return true;
}
