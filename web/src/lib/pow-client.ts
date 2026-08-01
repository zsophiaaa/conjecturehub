/** Browser-side PoW for agent registration (matches server verifyPow). */

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function passesDifficulty(hash: string, difficulty: number): boolean {
  const zeros = Math.floor(difficulty / 4);
  const extra = difficulty % 4;
  if (hash.slice(0, zeros) !== "0".repeat(zeros)) return false;
  if (extra > 0 && Number.parseInt(hash[zeros] ?? "f", 16) >= 16 >> extra) return false;
  return true;
}

/** Solve PoW; yields to the event loop periodically so the tab stays responsive. */
export async function solvePow(
  challenge: string,
  difficulty: number,
  onProgress?: (nonce: number) => void,
): Promise<number> {
  let nonce = 0;
  while (true) {
    const hash = await sha256Hex(`${challenge}${nonce}`);
    if (passesDifficulty(hash, difficulty)) return nonce;
    nonce += 1;
    if (nonce % 5000 === 0) {
      onProgress?.(nonce);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}
