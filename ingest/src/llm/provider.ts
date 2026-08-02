/**
 * Swappable LLM access.
 *
 * Free inference tiers are small and unstable — so nothing in this codebase may
 * assume abundant LLM calls. Every caller must work when the provider is `none`,
 * and the pipeline is built so that deterministic filtering does the heavy lifting.
 *
 * GitHub Models (models.github.ai) was retired 2026-07-30. Configure any
 * OpenAI-compatible endpoint via LLM_BASE_URL + LLM_API_KEY.
 */

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly available: boolean;
  /** Requests we are willing to make in one run. Enforced by the caller. */
  readonly dailyBudget: number;
  complete(messages: ChatMessage[], options?: { maxTokens?: number }): Promise<string>;
}

class NoopProvider implements LlmProvider {
  readonly name = "none";
  readonly available = false;
  readonly dailyBudget = 0;

  async complete(): Promise<string> {
    throw new Error("No LLM provider configured");
  }
}

interface OpenAiCompatibleConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dailyBudget: number;
}

class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly available = true;
  readonly dailyBudget: number;
  #config: OpenAiCompatibleConfig;

  constructor(config: OpenAiCompatibleConfig) {
    this.#config = config;
    this.name = config.name;
    this.dailyBudget = config.dailyBudget;
  }

  async complete(messages: ChatMessage[], options: { maxTokens?: number } = {}): Promise<string> {
    const res = await fetch(`${this.#config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.#config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.#config.model,
        messages,
        temperature: 0,
        max_tokens: options.maxTokens ?? 400,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`${this.name} returned HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${this.name} returned no content`);
    return content;
  }
}

/**
 * Resolution order:
 *   1. LLM_BASE_URL + LLM_API_KEY — any OpenAI-compatible endpoint
 *   2. none — deterministic sweep stages still run; matches need human triage
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  if (env.LLM_BASE_URL && env.LLM_API_KEY) {
    return new OpenAiCompatibleProvider({
      name: `custom (${env.LLM_MODEL ?? "unspecified"})`,
      baseUrl: env.LLM_BASE_URL.replace(/\/$/, ""),
      apiKey: env.LLM_API_KEY,
      model: env.LLM_MODEL ?? "gpt-4o-mini",
      dailyBudget: Number(env.LLM_DAILY_BUDGET ?? 120),
    });
  }

  return new NoopProvider();
}

/** Pulls the first JSON object out of a model response, tolerating code fences and prose. */
export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
