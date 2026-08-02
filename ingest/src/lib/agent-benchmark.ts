import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { REPO_ROOT, STATEMENTS_DIR } from "./paths.js";

export interface AgentChallengeEntry {
  id: string;
  difficulty?: string;
  rationale?: string;
}

export interface AgentBenchmarkFile {
  version: number;
  description?: string;
  challenges: AgentChallengeEntry[];
  ai_trace_examples?: { id: string; note?: string }[];
}

const BENCHMARK_PATH = path.join(REPO_ROOT, "benchmarks", "agent-challenges.yaml");
const FORUM_ACTIVITY_PATH = path.join(REPO_ROOT, "benchmarks", "forum-activity.yaml");

interface ForumActivityFile {
  observed_on?: string;
  threads?: { erdos: string; comments: number }[];
}

/**
 * Observed forum comment counts, keyed by Erdos problem number.
 *
 * Deliberately a checked-in snapshot rather than a fetch: the index build must
 * work offline and produce the same output twice. Absence means unmeasured.
 */
export function loadForumActivity(): Map<string, number> {
  if (!fs.existsSync(FORUM_ACTIVITY_PATH)) return new Map();
  const raw = YAML.parse(fs.readFileSync(FORUM_ACTIVITY_PATH, "utf8")) as ForumActivityFile;
  return new Map((raw.threads ?? []).map((t) => [String(t.erdos), t.comments]));
}

export function loadAgentBenchmark(): AgentBenchmarkFile {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    return { version: 1, challenges: [], ai_trace_examples: [] };
  }
  const raw = YAML.parse(fs.readFileSync(BENCHMARK_PATH, "utf8")) as AgentBenchmarkFile;
  return {
    version: raw.version ?? 1,
    description: raw.description,
    challenges: raw.challenges ?? [],
    ai_trace_examples: raw.ai_trace_examples ?? [],
  };
}

export function benchmarkIdSet(file: AgentBenchmarkFile = loadAgentBenchmark()): Set<string> {
  return new Set(file.challenges.map((c) => c.id));
}

/** True when statements/challenges/{id}.json exists for comparator verification. */
export function hasVerificationChallenge(conjectureId: string): boolean {
  return fs.existsSync(path.join(STATEMENTS_DIR, "challenges", `${conjectureId}.json`));
}
