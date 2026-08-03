/**
 * Groups the free-text system names on a claim into vendor families.
 *
 * `ai_assistance.systems` records what the claimant actually wrote, because
 * that is the citable fact: "GPT-5.5 Pro", "ChatGPT 5.5 Pro" and "Codex CLI"
 * are three different strings a mathematician typed into three different
 * threads. Rewriting them at ingest would destroy the source's own wording, so
 * the normalisation lives here and runs at build time instead.
 *
 * A family is a lab, not a model. Version-level counting is not meaningful when
 * roughly half the corpus's system strings omit a version and several name an
 * internal model with no public identity at all.
 */

export type SystemFamily =
  | "openai"
  | "anthropic"
  | "google-deepmind"
  | "harmonic"
  | "open-weights"
  | "unattributed";

export const FAMILY_LABELS: Record<SystemFamily, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  "google-deepmind": "Google DeepMind",
  harmonic: "Harmonic",
  "open-weights": "Open-weights",
  unattributed: "No public lab",
};

/**
 * Ordered: the first pattern that matches wins. `opus` has to be reachable
 * without `claude` because the corpus contains a bare "Opus 4.6", and the
 * open-weights test runs before the catch-all so "Deepseek Thinking" is not
 * counted as an unattributed agent.
 */
const RULES: { family: SystemFamily; pattern: RegExp }[] = [
  { family: "anthropic", pattern: /\b(claude|anthropic|opus|sonnet|haiku|fable)\b/i },
  { family: "openai", pattern: /\b(openai|chatgpt|gpt|codex|astra|o[34](?:-mini)?)\b/i },
  { family: "google-deepmind", pattern: /\b(gemini|deepmind|alphaproof|alphageometry|alphaevolve)\b/i },
  { family: "harmonic", pattern: /\b(harmonic|aristotle)\b/i },
  { family: "open-weights", pattern: /\b(deepseek|qwen|llama|glm|mistral|kimi|olmo|gemma)\b/i },
  { family: "unattributed", pattern: /./ },
];

export function systemFamily(system: string): SystemFamily {
  for (const rule of RULES) {
    if (rule.pattern.test(system)) return rule.family;
  }
  return "unattributed";
}

/**
 * The set of families credited on one claim. A claim naming "GPT-5.2" and
 * "Codex CLI" credits OpenAI once, not twice, but a claim naming GPT-5.2 and
 * Claude credits both -- there is no way to attribute a joint result to one
 * lab, and picking one would be a judgement call with no source behind it.
 */
export function claimFamilies(systems: string[] | undefined): SystemFamily[] {
  return [...new Set((systems ?? []).map(systemFamily))];
}
