import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fetchJson, USER_AGENT } from "../lib/http.js";
import { CACHE_DIR } from "../lib/paths.js";

/**
 * Ingests google-deepmind/formal-conjectures.
 *
 * The repository has no JSON index; metadata lives in Lean attributes
 * (`@[category research open, AMS 5 11]`) and the informal statement lives in
 * the docstring above each theorem. So we parse the Lean source.
 *
 * We pin to a tagged release rather than main. Upstream itself tracks monthly
 * tagged mathlib releases, and formalizations stop compiling within months, so
 * an unpinned ingest would produce a corpus that silently drifts.
 */

export const REPO = "google-deepmind/formal-conjectures";
export const LICENSE = "Apache-2.0";

export interface FcDeclaration {
  name: string;
  category: string;
  ams: string[];
  doc: string | null;
  statement: string;
  isVariant: boolean;
}

export interface FcFile {
  /** Path within the upstream repo, e.g. FormalConjectures/ErdosProblems/1.lean */
  path: string;
  title: string;
  references: { label: string; url: string }[];
  declarations: FcDeclaration[];
}

export async function resolveLatestTag(): Promise<string> {
  const tags = await fetchJson<{ name: string }[]>(
    `https://api.github.com/repos/${REPO}/tags?per_page=50`,
    { ttl: 86400 },
  );
  const semver = tags
    .map((t) => t.name)
    .filter((n) => /^v\d+\.\d+\.\d+$/.test(n))
    .sort((a, b) => {
      const pa = a.slice(1).split(".").map(Number);
      const pb = b.slice(1).split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
      }
      return 0;
    });
  const latest = semver[0];
  if (!latest) throw new Error("no semver tag found on formal-conjectures");
  return latest;
}

/** Downloads and extracts the tagged tarball once, then reuses it. */
export async function ensureCheckout(tag: string): Promise<string> {
  const dest = path.join(CACHE_DIR, `formal-conjectures-${tag}`);
  if (fs.existsSync(path.join(dest, "FormalConjectures"))) return dest;

  fs.mkdirSync(dest, { recursive: true });
  const tarball = path.join(os.tmpdir(), `formal-conjectures-${tag}.tar.gz`);
  const url = `https://codeload.github.com/${REPO}/tar.gz/refs/tags/${tag}`;

  execFileSync("curl", ["-sSL", "-A", USER_AGENT, url, "-o", tarball], { stdio: "pipe" });
  execFileSync("tar", ["-xzf", tarball, "-C", dest, "--strip-components=1"], { stdio: "pipe" });
  fs.rmSync(tarball, { force: true });

  return dest;
}

function walk(dir: string, base: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.name.endsWith(".lean")) out.push(path.relative(base, full));
  }
  return out;
}

const MODULE_DOC = /\/-!\s*([\s\S]*?)-\//;
/**
 * A markdown link whose URL may itself contain balanced parentheses.
 *
 * The obvious `[^)\s]+` truncates at the first inner paren, which silently
 * mangles exactly the URLs mathematicians cite most:
 * `en.wikipedia.org/wiki/Sunflower_(mathematics)` became
 * `en.wikipedia.org/wiki/Sunflower_(mathematics`, and old Wiley DOIs of the form
 * `10.1002/(SICI)...` lost everything after `(SICI`. One balanced nesting level
 * covers every case upstream actually uses.
 */
const MARKDOWN_LINK = /\[([^\]]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+)\)/g;

/**
 * Matches the attribute block and declaration head. Upstream lints these
 * conventions strictly, which is what makes regex viable here; anything
 * unparseable is skipped rather than guessed at.
 */
const DECLARATION =
  /@\[([^\]]*?)\]\s*(?:private\s+|protected\s+|noncomputable\s+)*(?:theorem|lemma)\s+([^\s:(){}[\]]+)([\s\S]*?)(?::=|\bsorry\b)/g;

/**
 * The docstring belonging to a declaration is the block comment immediately
 * before it. Searching backwards from the declaration is necessary because a
 * forward optional-prefix match will happily reach back past unrelated code
 * when a declaration has no docstring of its own.
 */
function docstringBefore(body: string, declStart: number): string | null {
  const preceding = body.slice(0, declStart).trimEnd();
  if (!preceding.endsWith("-/")) return null;
  const open = preceding.lastIndexOf("/--");
  if (open === -1) return null;
  // A `-/` between the opener and here means we found a different comment.
  const inner = preceding.slice(open + 3, preceding.length - 2);
  if (inner.includes("-/")) return null;
  return inner;
}

function parseAttributes(raw: string): { category: string | null; ams: string[] } {
  // e.g. "category research open, AMS 5 11"
  const category = /category\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/.exec(raw)?.[1]?.trim() ?? null;
  const amsRaw = /AMS\s+([0-9\s]+)/.exec(raw)?.[1] ?? "";
  const ams = amsRaw
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n.padStart(2, "0"));
  return { category, ams };
}

function cleanDoc(doc: string | undefined): string | null {
  if (!doc) return null;
  const text = doc
    .split("\n")
    .map((line) => line.replace(/^\s?/, ""))
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

export function parseLeanFile(relPath: string, source: string): FcFile | null {
  // Drop the license header so its URL is not mistaken for a reference.
  const body = source.replace(/^\s*\/-[\s\S]*?-\/\s*/, "");

  const moduleDoc = MODULE_DOC.exec(body)?.[1] ?? "";
  const title = /^#\s+(.+)$/m.exec(moduleDoc)?.[1]?.trim() ?? "";

  const references: { label: string; url: string }[] = [];
  for (const m of moduleDoc.matchAll(MARKDOWN_LINK)) {
    if (m[1] && m[2]) references.push({ label: m[1], url: m[2] });
  }

  const declarations: FcDeclaration[] = [];
  DECLARATION.lastIndex = 0;
  for (const m of body.matchAll(DECLARATION)) {
    const [, attrs, name, statement] = m;
    if (!name || !attrs) continue;
    const { category, ams } = parseAttributes(attrs);
    if (!category) continue;
    declarations.push({
      name,
      category,
      ams,
      doc: cleanDoc(docstringBefore(body, m.index) ?? undefined),
      statement: (statement ?? "").trim(),
      isVariant: name.includes(".variants."),
    });
  }

  if (!title && declarations.length === 0) return null;
  return { path: relPath, title, references, declarations };
}

/** Declarations that describe actual mathematics, as opposed to helper API or tests. */
export function researchDeclarations(file: FcFile): FcDeclaration[] {
  return file.declarations.filter((d) => d.category.startsWith("research"));
}

/**
 * The declaration a page should lead with: a non-variant research statement if
 * one exists, else the first research statement, else nothing.
 */
export function primaryDeclaration(file: FcFile): FcDeclaration | null {
  const research = researchDeclarations(file);
  return (
    research.find((d) => !d.isVariant && d.category === "research open") ??
    research.find((d) => !d.isVariant) ??
    research[0] ??
    null
  );
}

export async function loadAll(tag?: string): Promise<{ tag: string; files: FcFile[] }> {
  const resolved = tag ?? (await resolveLatestTag());
  const root = await ensureCheckout(resolved);
  const dir = path.join(root, "FormalConjectures");

  const files: FcFile[] = [];
  for (const rel of walk(dir, root)) {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    const parsed = parseLeanFile(rel, source);
    if (parsed) files.push(parsed);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { tag: resolved, files };
}
