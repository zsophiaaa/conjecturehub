/**
 * Swappable LLM access.
 *
 * Free inference tiers are small and unstable — so nothing in this codebase may
 * assume abundant LLM calls. Every caller must work when the provider is `none`,
 * and the pipeline is built so that deterministic filtering does the heavy lifting.
 *
 * Two wire formats are supported, which covers essentially everything:
 *
 *   OpenAI chat-completions — OpenAI, Groq, Together, OpenRouter, DeepSeek,
 *     Mistral, vLLM, llama.cpp, LM Studio, Ollama. Set LLM_BASE_URL.
 *   Anthropic messages — a genuinely different shape, not a base-URL swap: the
 *     key travels in x-api-key, the system prompt is a top-level field rather
 *     than a message, max_tokens is required, and the reply is a content array.
 *
 * Nothing is inferred from a model name. The operator says which provider they
 * are using and which model they want, because guessing wrong here fails at the
 * far end of a rate-limited request with an opaque error.
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

interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  dailyBudget: number;
}

/**
 * The account is out of quota until it resets, rather than merely being asked
 * to slow down. Callers should stop rather than work through their remaining
 * items, and the distinction is worth a type: one classify run spent fifty
 * minutes in backoff, and every call it eventually made had already failed.
 */
export class LlmQuotaExhaustedError extends Error {}

/**
 * Free tiers publish two different 429s. A per-minute throttle is worth waiting
 * out. A daily token cap is not — the reset is hours away, so retrying only
 * burns CI minutes to arrive in the same place.
 */
function isQuotaExhausted(status: number, body: string): boolean {
  // 400 is included because Anthropic reports an exhausted credit balance as an
  // invalid_request_error rather than as a rate limit. The pattern is specific
  // enough that an ordinary 400 will not match.
  if (status !== 429 && status !== 402 && status !== 400) return false;
  // Must be precise about the *day*. Groq appends "Upgrade to Dev Tier today at
  // .../settings/billing" to every rate-limit message including the per-minute
  // ones, so matching "billing" reads a nine-second throttle as the day ending.
  return /tokens per day|requests per day|\bTPD\b|\bRPD\b|insufficient_quota|exceeded your current quota|credit balance is too low/i.test(
    body,
  );
}

/**
 * Retries the calls worth retrying and gives up immediately on the ones that
 * are not. Free tiers rate-limit aggressively — a sweep firing classifier calls
 * back to back collects 429s partway through — and honouring the server's own
 * Retry-After turns lost classifications into a slower run.
 *
 * Shared by both providers so a fix to the backoff cannot land on one and miss
 * the other.
 */
async function sendWithRetries(name: string, send: () => Promise<Response>): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await send();
    if (res.ok) return res;

    const body = await res.text().catch(() => "");

    if (isQuotaExhausted(res.status, body)) {
      throw new LlmQuotaExhaustedError(
        `${name} is out of quota until it resets: ${body.slice(0, 200)}`,
      );
    }

    lastError = new Error(`${name} returned HTTP ${res.status}: ${body.slice(0, 300)}`);

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === MAX_RETRIES) break;

    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_BACKOFF_MS)
        : Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
    await sleep(waitMs);
  }

  throw lastError ?? new Error(`${name} failed`);
}

class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: string;
  readonly available = true;
  readonly dailyBudget: number;
  #config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.#config = config;
    this.name = config.name;
    this.dailyBudget = config.dailyBudget;
  }

  async complete(messages: ChatMessage[], options: { maxTokens?: number } = {}): Promise<string> {
    const res = await sendWithRetries(this.name, () =>
      fetch(`${this.#config.baseUrl}/chat/completions`, {
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
      }),
    );

    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string; reasoning?: string };
        finish_reason?: string;
      }[];
    };
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      // Reasoning models keep their scratchpad in a separate field and only
      // write `content` once they stop thinking. A budget too small to finish
      // reasoning therefore returns an empty answer rather than a truncated
      // one, which is a confusing way to learn maxTokens is low.
      throw new Error(
        choice?.message?.reasoning
          ? `${this.name} used its entire token budget reasoning and never wrote an answer. ` +
            "Raise maxTokens."
          : `${this.name} returned no content`,
      );
    }
    // A truncated answer is usually unparseable JSON downstream, and saying so
    // beats letting the caller guess why extraction failed.
    if (choice?.finish_reason === "length") {
      console.warn(
        `${this.name}: response hit the token limit and is probably truncated. ` +
          "Raise maxTokens or ask the model for a shorter answer.",
      );
    }
    return content;
  }
}

class AnthropicProvider implements LlmProvider {
  readonly name: string;
  readonly available = true;
  readonly dailyBudget: number;
  #config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.#config = config;
    this.name = config.name;
    this.dailyBudget = config.dailyBudget;
  }

  async complete(messages: ChatMessage[], options: { maxTokens?: number } = {}): Promise<string> {
    // Anthropic takes the system prompt as a top-level field. Left in the
    // messages array it is rejected outright, so hoist it and join if a caller
    // sent more than one.
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const turns = messages.filter((m) => m.role !== "system");

    const res = await sendWithRetries(this.name, () =>
      fetch(`${this.#config.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.#config.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.#config.model,
          system: system || undefined,
          messages: turns.map((m) => ({ role: "user", content: m.content })),
          temperature: 0,
          // Required here, unlike the OpenAI shape where it is optional.
          max_tokens: options.maxTokens ?? 400,
        }),
      }),
    );

    const data = (await res.json()) as {
      content?: { type?: string; text?: string }[];
      stop_reason?: string;
    };
    const text = (data.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    if (!text) throw new Error(`${this.name} returned no text content`);
    if (data.stop_reason === "max_tokens") {
      console.warn(
        `${this.name}: response hit the token limit and is probably truncated. ` +
          "Raise maxTokens or ask the model for a shorter answer.",
      );
    }
    return text;
  }
}

const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const OPENAI_BASE_URL = "https://api.openai.com/v1";

/**
 * Configuration, in the order it is consulted:
 *
 *   LLM_PROVIDER   "anthropic" or "openai" (default). Only needed when the key
 *                  alone is ambiguous — setting ANTHROPIC_API_KEY is enough.
 *   LLM_API_KEY    or ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY
 *   LLM_MODEL      required; there is no safe default, since model ids are
 *                  retired without notice and a stale one fails as a bare 404
 *   LLM_BASE_URL   only for an OpenAI-compatible host that is not OpenAI
 *
 * With nothing set the provider is `none`: the deterministic sweep stages still
 * run and matches go to human triage, which is a supported way to operate.
 */
export function resolveProvider(rawEnv: NodeJS.ProcessEnv = process.env): LlmProvider {
  // A GitHub Actions secret that was never set arrives as an empty string, not
  // as undefined, and `??` keeps it. Left alone that turns an unset key into a
  // configured-but-blank one and an unset base URL into a relative path.
  const env = new Proxy(rawEnv, {
    get: (target, prop: string) => {
      const value = target[prop];
      return typeof value === "string" && value.trim() === "" ? undefined : value;
    },
  });

  const anthropicKey = env.ANTHROPIC_API_KEY;
  const openAiKey = env.OPENAI_API_KEY ?? env.GROQ_API_KEY;
  const declared = env.LLM_PROVIDER?.trim().toLowerCase();

  if (declared && declared !== "anthropic" && declared !== "openai") {
    console.warn(
      `LLM_PROVIDER="${declared}" is not recognised; expected "anthropic" or "openai". ` +
        "Treating it as openai — any OpenAI-compatible host is reached with LLM_BASE_URL.",
    );
  }

  // Both keys present and nothing declared is the one case where picking
  // quietly would send a key to the wrong API and fail somewhere unhelpful.
  if (!declared && anthropicKey && (openAiKey || env.LLM_API_KEY)) {
    console.warn(
      "Both ANTHROPIC_API_KEY and an OpenAI-style key are set. Using the OpenAI-compatible " +
        'path; set LLM_PROVIDER="anthropic" if that is not what you meant.',
    );
  }

  const useAnthropic =
    declared === "anthropic" || (!declared && !!anthropicKey && !openAiKey && !env.LLM_API_KEY);
  const apiKey = useAnthropic ? (anthropicKey ?? env.LLM_API_KEY) : (env.LLM_API_KEY ?? openAiKey);
  if (!apiKey) return new NoopProvider();

  const dailyBudget = Number(env.LLM_DAILY_BUDGET ?? 120);
  const model = env.LLM_MODEL;
  if (!model) {
    // Degrade rather than throw: the whole pipeline is built to run without a
    // model, and taking down a scheduled sweep over a missing variable would be
    // a worse failure than doing the deterministic stages and queueing the rest.
    console.warn(
      "An API key is set but LLM_MODEL is not, so no model will be called. Name the one you " +
        "want — for example openai/gpt-oss-120b on Groq, gpt-4o-mini on OpenAI, or " +
        "claude-sonnet-4-5 on Anthropic. There is no default because a retired model id comes " +
        "back as an unexplained 404.",
    );
    return new NoopProvider();
  }

  if (useAnthropic) {
    return new AnthropicProvider({
      name: `anthropic (${model})`,
      baseUrl: (env.LLM_BASE_URL ?? ANTHROPIC_BASE_URL).replace(/\/$/, ""),
      apiKey,
      model,
      dailyBudget,
    });
  }

  return new OpenAiCompatibleProvider({
    name: `${env.LLM_BASE_URL ? "custom" : "openai"} (${model})`,
    baseUrl: (env.LLM_BASE_URL ?? OPENAI_BASE_URL).replace(/\/$/, ""),
    apiKey,
    model,
    dailyBudget,
  });
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
