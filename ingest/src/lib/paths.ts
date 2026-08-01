import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Repo root, resolved from this file rather than the working directory. */
export const REPO_ROOT = path.resolve(here, "..", "..", "..");

export const CONJECTURES_DIR = path.join(REPO_ROOT, "conjectures");
export const SCHEMA_PATH = path.join(REPO_ROOT, "schema", "conjecture.schema.json");
export const STATEMENTS_DIR = path.join(REPO_ROOT, "statements");
export const CACHE_DIR = path.join(REPO_ROOT, "ingest", ".cache");
export const WEB_INDEX_DIR = path.join(REPO_ROOT, "web", "public", "index");
export const SITE_CONFIG_PATH = path.join(REPO_ROOT, "conjecturehub.config.json");
