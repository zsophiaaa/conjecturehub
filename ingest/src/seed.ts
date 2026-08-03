import path from "node:path";
import { today } from "./lib/http.js";
import { slugify } from "./lib/conjecture.js";
import type { Claim, Conjecture, Provenance } from "./types.js";
import * as fc from "./sources/formal-conjectures.js";
import * as erdos from "./sources/erdos.js";
import * as wikidata from "./sources/wikidata.js";

/**
 * Builds the seed corpus by merging three permissively-licensed sources into
 * one record per conjecture, joined on stable identifiers where they exist and
 * on normalized names where they do not.
 */

export interface SeedStats {
  formalConjecturesTag: string;
  erdosCommit: string;
  fromFormalConjectures: number;
  fromErdos: number;
  fromWikidata: number;
  erdosJoinedToLean: number;
  wikidataMatched: number;
  wikidataNew: number;
  total: number;
}

/** Names collapse to a comparison key so "The Collatz Conjecture" matches "Collatz conjecture". */
function nameKey(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

class Registry {
  private byId = new Map<string, Conjecture>();
  private byName = new Map<string, string>();

  private uniqueId(base: string): string {
    const root = base || "conjecture";
    if (!this.byId.has(root)) return root;
    for (let n = 2; ; n++) {
      const candidate = `${root}-${n}`;
      if (!this.byId.has(candidate)) return candidate;
    }
  }

  add(conjecture: Omit<Conjecture, "id">, preferredId: string): Conjecture {
    const id = this.uniqueId(preferredId);
    const record: Conjecture = { ...conjecture, id };
    this.byId.set(id, record);
    this.indexNames(record);
    return record;
  }

  indexNames(record: Conjecture): void {
    for (const name of [record.title, ...(record.aliases ?? [])]) {
      const key = nameKey(name);
      if (key && !this.byName.has(key)) this.byName.set(key, record.id);
    }
  }

  get(id: string): Conjecture | undefined {
    return this.byId.get(id);
  }

  findByName(name: string): Conjecture | undefined {
    const id = this.byName.get(nameKey(name));
    return id ? this.byId.get(id) : undefined;
  }

  all(): Conjecture[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get size(): number {
    return this.byId.size;
  }
}

const FC_BLOB = (tag: string, file: string) =>
  `https://github.com/${fc.REPO}/blob/${tag}/${file}`;

/** ErdosProblems/1.lean -> "1". Anything else -> null. */
function erdosNumberFromPath(file: string): string | null {
  const m = /(?:^|\/)ErdosProblems\/(\d+)\.lean$/.exec(file);
  return m?.[1] ?? null;
}

function idForFormalConjecture(file: fc.FcFile): string {
  const erdosNumber = erdosNumberFromPath(file.path);
  if (erdosNumber) return `erdos-${erdosNumber}`;

  const titleSlug = slugify(file.title);
  if (titleSlug) return titleSlug;

  const base = path.basename(file.path, ".lean");
  const dir = path.basename(path.dirname(file.path));
  return slugify(`${dir}-${base}`);
}

function fcProvenance(tag: string, file: string, fields: string[]): Provenance {
  return {
    fields,
    source: "google-deepmind/formal-conjectures",
    url: FC_BLOB(tag, file),
    license: fc.LICENSE,
    retrieved: today(),
    upstream_version: tag,
  };
}

function buildFromFormalConjectures(registry: Registry, tag: string, files: fc.FcFile[]): number {
  let count = 0;

  for (const file of files) {
    const primary = fc.primaryDeclaration(file);
    if (!primary) continue;

    const research = fc.researchDeclarations(file);
    const msc = [...new Set(research.flatMap((d) => d.ams))].sort();
    const solved = primary.category === "research solved";

    const claims: Claim[] = [];
    if (solved) {
      // Upstream marks this solved. That is a statement about the literature,
      // not a proof we have checked, so it lands at `published` and credits the
      // upstream maintainers as the reviewers.
      claims.push({
        id: "placeholder",
        type: "proved",
        evidence_tier: "published",
        state: "active",
        recorded_on: today(),
        source: {
          kind: "dataset",
          url: FC_BLOB(tag, file.path),
          title: `formal-conjectures marks ${primary.name} as research solved`,
        },
        reviewer: "google-deepmind/formal-conjectures maintainers",
        notes:
          "Imported from the upstream `research solved` category. The statement is formalized; the proof has not been machine-checked by ConjectureHub.",
      });
    }

    const record = registry.add(
      {
        title: file.title || primary.name,
        aliases: [],
        statement: {
          informal: primary.doc,
          formal: research.map((d) => ({
            language: "lean4" as const,
            path: null,
            theorem: d.name,
            upstream: FC_BLOB(tag, file.path),
            toolchain: tag,
            category: d.category,
            reviewed_by: null,
            definition_hole: false,
          })),
        },
        subject: { msc, tags: [] },
        ids: {
          formal_conjectures: file.path,
          oeis: [],
          arxiv: [],
          external: file.references.map((r) => ({ label: r.label, url: r.url })),
        },
        openness_basis: {
          meaning: "no_published_solution_known_to_curator",
          asserted_by: "google-deepmind/formal-conjectures",
          asserted_on: null,
          note: solved
            ? null
            : `Categorized upstream as "${primary.category}" at ${tag}.`,
        },
        claims,
        provenance: [
          fcProvenance(tag, file.path, [
            "title",
            "statement.informal",
            "statement.formal",
            "subject.msc",
            "ids.external",
          ]),
        ],
      },
      idForFormalConjecture(file),
    );

    for (const claim of record.claims) {
      if (claim.id === "placeholder") claim.id = `${record.id}-fc-solved`;
    }

    // Wikipedia references double as a Wikipedia crosswalk.
    const wiki = file.references.find((r) => /en\.wikipedia\.org\/wiki\//.test(r.url));
    if (wiki) record.ids!.wikipedia = wiki.url;

    count++;
  }

  return count;
}

/**
 * formal-conjectures' "research solved" means *resolved*, in either direction, but
 * the imported claim has to pick a `type` and defaults to `proved`. Where
 * erdosproblems.com tells us the direction, adopt it, otherwise a refuted
 * conjecture ends up displaying as proved: both claims sit at the `published`
 * tier, so status derivation breaks the tie on array order and the import wins.
 * That is precisely the "solved" vs "proved" conflation this project exists to
 * avoid, so it is reconciled at ingest rather than left to the reader.
 */
function reconcileSolvedDirection(record: { id: string; claims: Claim[] }): void {
  const imported = record.claims.find((c) => c.id === `${record.id}-fc-solved`);
  const upstream = record.claims.find((c) => c.id === `${record.id}-erdos-status`);
  if (!imported || !upstream) return;
  if (imported.type === upstream.type || upstream.type === "resolved_by_prior_literature") return;

  imported.type = upstream.type;
  imported.notes =
    "Imported from the upstream `research solved` category, which records that the problem is " +
    `resolved without stating the direction. Direction taken from erdosproblems.com, which records it as "${upstream.type}". ` +
    "The statement is formalized; the proof has not been machine-checked by ConjectureHub.";
}

function buildFromErdos(
  registry: Registry,
  problems: erdos.ErdosProblem[],
  commit: string,
): { created: number; joined: number } {
  let created = 0;
  let joined = 0;

  for (const problem of problems) {
    const id = `erdos-${problem.number}`;
    const url = erdos.problemUrl(problem.number);
    const { resolution } = erdos.parseState(problem.status?.state);
    const lastUpdate = problem.status?.last_update ?? problem.informal_status?.last_update ?? null;

    const provenance: Provenance = {
      fields: ["ids.erdos", "ids.oeis", "subject.tags", "openness_basis", "claims"],
      source: "teorth/erdosproblems",
      url: `https://github.com/${erdos.REPO}/blob/${commit}/${erdos.DATA_PATH}`,
      license: erdos.LICENSE,
      retrieved: today(),
      upstream_version: commit,
    };

    const claimType = erdos.resolutionToClaimType(resolution);
    const claim: Claim | null = claimType
      ? {
          id: `${id}-erdos-status`,
          type: claimType,
          evidence_tier: "published",
          state: "active",
          asserted_on: lastUpdate,
          recorded_on: today(),
          source: {
            kind: "dataset",
            url,
            title: `erdosproblems.com records this problem as "${resolution}"`,
          },
          reviewer: "teorth/erdosproblems maintainers",
          notes:
            resolution === "solved"
              ? "Upstream records this as solved without specifying the direction."
              : null,
        }
      : null;

    const existing = registry.get(id);
    if (existing) {
      // Joined to a formal-conjectures file by problem number.
      joined++;
      existing.ids!.erdos = problem.number;
      existing.ids!.oeis = [
        ...new Set([...(existing.ids!.oeis ?? []), ...erdos.cleanOeis(problem.oeis)]),
      ];
      existing.ids!.external = [
        ...(existing.ids!.external ?? []),
        ...((existing.ids!.external ?? []).some((e) => e.url === url)
          ? []
          : [{ label: `erdosproblems.com/${problem.number}`, url }]),
      ];
      existing.subject!.tags = [
        ...new Set([...(existing.subject!.tags ?? []), ...(problem.tags ?? [])]),
      ];
      existing.openness_basis.asserted_by = "erdosproblems.com";
      existing.openness_basis.asserted_on = lastUpdate;
      if (claim && !existing.claims.some((c) => c.type === claim.type)) {
        existing.claims.push(claim);
      }
      reconcileSolvedDirection(existing);
      existing.provenance.push(provenance);
      continue;
    }

    registry.add(
      {
        title: `Erdős Problem ${problem.number}`,
        aliases: [],
        statement: {
          // Statement text lives on erdosproblems.com and is not ours to copy.
          informal: null,
          formal: [],
        },
        subject: { msc: [], tags: problem.tags ?? [] },
        ids: {
          erdos: problem.number,
          oeis: erdos.cleanOeis(problem.oeis),
          arxiv: [],
          external: [{ label: `erdosproblems.com/${problem.number}`, url }],
        },
        openness_basis: {
          meaning: "no_published_solution_known_to_curator",
          asserted_by: "erdosproblems.com",
          asserted_on: lastUpdate,
          note: "No formalization is indexed for this problem yet; read the statement upstream.",
        },
        claims: claim ? [claim] : [],
        provenance: [provenance],
      },
      id,
    );
    created++;
  }

  return { created, joined };
}

function buildFromWikidata(
  registry: Registry,
  items: wikidata.WikidataConjecture[],
): { matched: number; created: number } {
  let matched = 0;
  let created = 0;

  for (const item of items) {
    const provenance: Provenance = {
      fields: [
        "aliases",
        "ids.wikidata",
        "ids.wikipedia",
        "ids.mathworld",
        "notability.wikipedia_language_editions",
      ],
      source: "wikidata",
      url: `https://www.wikidata.org/wiki/${item.qid}`,
      license: wikidata.LICENSE,
      retrieved: today(),
      upstream_version: null,
    };

    const notability = {
      wikipedia_language_editions: item.wikipediaLanguageEditions,
      measured_on: today(),
    };

    const candidates = [item.label, ...item.aliases];
    const existing = candidates.map((n) => registry.findByName(n)).find(Boolean);

    if (existing) {
      matched++;
      existing.ids!.wikidata = item.qid;
      existing.ids!.wikipedia ??= item.wikipedia;
      existing.ids!.mathworld ??= item.mathworld;
      existing.notability = notability;
      existing.aliases = [
        ...new Set([
          ...(existing.aliases ?? []),
          ...candidates.filter((n) => nameKey(n) !== nameKey(existing.title)),
        ]),
      ].sort();
      existing.provenance.push(provenance);
      registry.indexNames(existing);
      continue;
    }

    registry.add(
      {
        title: item.label,
        aliases: item.aliases.sort(),
        statement: { informal: null, formal: [] },
        subject: { msc: [], tags: [] },
        ids: {
          wikidata: item.qid,
          wikipedia: item.wikipedia,
          mathworld: item.mathworld,
          oeis: [],
          arxiv: [],
        },
        notability,
        openness_basis: {
          meaning: "unknown",
          asserted_by: "wikidata",
          asserted_on: null,
          note: "Identity record only. No statement or status has been ingested for this conjecture yet.",
        },
        claims: [],
        provenance: [provenance],
      },
      slugify(item.label),
    );
    created++;
  }

  return { matched, created };
}

export async function buildSeedCorpus(): Promise<{ records: Conjecture[]; stats: SeedStats }> {
  const registry = new Registry();

  const fcData = await fc.loadAll();
  const fromFormalConjectures = buildFromFormalConjectures(registry, fcData.tag, fcData.files);

  const erdosData = await erdos.loadAll();
  const erdosResult = buildFromErdos(registry, erdosData.problems, erdosData.commit);

  const wikidataItems = await wikidata.loadAll();
  const wikidataResult = buildFromWikidata(registry, wikidataItems);

  return {
    records: registry.all(),
    stats: {
      formalConjecturesTag: fcData.tag,
      erdosCommit: erdosData.commit.slice(0, 8),
      fromFormalConjectures,
      fromErdos: erdosResult.created,
      fromWikidata: wikidataResult.created,
      erdosJoinedToLean: erdosResult.joined,
      wikidataMatched: wikidataResult.matched,
      wikidataNew: wikidataResult.created,
      total: registry.size,
    },
  };
}
