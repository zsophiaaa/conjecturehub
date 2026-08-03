import { resolveProvider } from "../llm/provider.js";

/**
 * Provider resolution, checked against the configurations people actually set.
 * Getting this wrong fails at the far end of a rate-limited request with an
 * opaque error, which is an expensive way to learn a key went to the wrong API.
 */

let failures = 0;

function expect(name: string, env: Record<string, string | undefined>, want: string) {
  const got = resolveProvider(env as NodeJS.ProcessEnv).name;
  const hit = got === want;
  console.log(`${hit ? "ok  " : "FAIL"}  ${name}${hit ? "" : ` -> got "${got}", want "${want}"`}`);
  if (!hit) failures++;
}

expect("nothing configured falls back to none", {}, "none");

// Every one of these is what an unset GitHub Actions secret actually looks
// like, and treating "" as configured is how a run ends up posting to a
// relative URL with a blank key.
expect(
  "empty strings from unset Actions secrets count as unset",
  { LLM_BASE_URL: "", LLM_API_KEY: "", ANTHROPIC_API_KEY: "", LLM_PROVIDER: "", LLM_MODEL: "" },
  "none",
);

expect(
  "a blank LLM_API_KEY does not mask a real OPENAI_API_KEY",
  { LLM_API_KEY: "", LLM_BASE_URL: "", OPENAI_API_KEY: "sk-x", LLM_MODEL: "gpt-4o-mini" },
  "openai (gpt-4o-mini)",
);

expect(
  "a key with no model degrades rather than guessing",
  { OPENAI_API_KEY: "sk-x" },
  "none",
);

expect(
  "OPENAI_API_KEY alone goes to OpenAI",
  { OPENAI_API_KEY: "sk-x", LLM_MODEL: "gpt-4o-mini" },
  "openai (gpt-4o-mini)",
);

expect(
  "ANTHROPIC_API_KEY alone goes to Anthropic",
  { ANTHROPIC_API_KEY: "sk-ant-x", LLM_MODEL: "claude-sonnet-4-5" },
  "anthropic (claude-sonnet-4-5)",
);

// Groq is the configuration this project actually runs on.
expect(
  "a base URL makes it a custom OpenAI-compatible host",
  {
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_API_KEY: "gsk-x",
    LLM_MODEL: "openai/gpt-oss-120b",
  },
  "custom (openai/gpt-oss-120b)",
);

// Both keys present is the case where guessing would silently pick one.
expect(
  "LLM_PROVIDER settles it when both keys are set",
  {
    OPENAI_API_KEY: "sk-x",
    ANTHROPIC_API_KEY: "sk-ant-x",
    LLM_PROVIDER: "anthropic",
    LLM_MODEL: "claude-sonnet-4-5",
  },
  "anthropic (claude-sonnet-4-5)",
);

expect(
  "without LLM_PROVIDER, both keys set prefers OpenAI-compatible",
  { OPENAI_API_KEY: "sk-x", ANTHROPIC_API_KEY: "sk-ant-x", LLM_MODEL: "gpt-4o-mini" },
  "openai (gpt-4o-mini)",
);

console.log(
  failures === 0 ? "\nAll provider self-tests passed." : `\n${failures} provider self-test(s) failed.`,
);
process.exit(failures === 0 ? 0 : 1);
