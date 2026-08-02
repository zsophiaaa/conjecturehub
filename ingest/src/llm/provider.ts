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

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    // Free inference tiers are exactly the ones this project expects to run on,
    // and they rate-limit aggressively: a sweep firing its classifier calls back
    // to back will collect 429s partway through. Retrying with the server's own
    // Retry-After turns that from lost classifications into a slower run.
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: { message?: { content?: string }; finish_reason?: string }[];
        };
        const choice = data.choices?.[0];
        const content = choice?.message?.content;
        if (!content) throw new Error(`${this.name} returned no content`);
        // A truncated answer is usually unparseable JSON downstream, and saying
        // so beats letting the caller guess why extraction failed.
        if (choice?.finish_reason === "length") {
          console.warn(
            `${this.name}: response hit the token limit and is probably truncated. ` +
              "Raise maxTokens or ask the model for a shorter answer.",
          );
        }
        return content;
      }

      const body = await res.text().catch(() => "");
      lastError = new Error(`${this.name} returned HTTP ${res.status}: ${body.slice(0, 300)}`);

      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) break;

      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS)
        : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
      await sleep(waitMs);
    }

    throw lastError ?? new Error(`${this.name} failed`);
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
