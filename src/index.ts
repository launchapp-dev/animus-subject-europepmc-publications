import { definePlugin, PluginKind, type Subject, type SubjectBackend, type SubjectListParams, type SubjectStatus } from "@launchapp-dev/animus-plugin-sdk";

const NAME = "animus-subject-europepmc-publications";
const VERSION = "0.1.0";
const SUBJECT_KIND = "europepmc.publication";
const DEFAULT_API_URL = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const DEFAULT_QUERY = "machine learning";

interface Config {
  apiUrl: string;
  query: string;
  sort?: string;
  resultType?: string;
  localQuery?: string;
  limit: number;
}

interface FullTextUrl {
  url?: string;
  documentStyle?: string;
  availability?: string;
  availabilityCode?: string;
  site?: string;
}

interface EuropePmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author?: Array<{ fullName?: string; firstName?: string; lastName?: string }> };
  journalTitle?: string;
  pubYear?: string;
  firstPublicationDate?: string;
  firstIndexDate?: string;
  citedByCount?: number;
  isOpenAccess?: string;
  inEPMC?: string;
  hasReferences?: string;
  hasTextMinedTerms?: string;
  fullTextUrlList?: { fullTextUrl?: FullTextUrl[] };
}

interface EuropePmcSearchResponse {
  hitCount?: number;
  resultList?: { result?: EuropePmcResult[] };
}

function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw === "" ? undefined : raw;
}

function normalizeBaseUrl(raw: string | undefined, fallback: string): string {
  return (raw ?? fallback).replace(/\/+$/, "");
}

function readPositiveInt(raw: string | undefined, fallback: number, max: number): number {
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}

function readConfig(): Config {
  return {
    apiUrl: normalizeBaseUrl(optionalEnv("EUROPEPMC_API_URL"), DEFAULT_API_URL),
    query: optionalEnv("EUROPEPMC_QUERY") ?? DEFAULT_QUERY,
    sort: optionalEnv("EUROPEPMC_SORT"),
    resultType: optionalEnv("EUROPEPMC_RESULT_TYPE"),
    localQuery: optionalEnv("EUROPEPMC_LOCAL_QUERY"),
    limit: readPositiveInt(optionalEnv("EUROPEPMC_LIMIT"), 50, 1000),
  };
}

function encodePart(value: string): string {
  return encodeURIComponent(value);
}

function decodePart(value: string): string {
  return decodeURIComponent(value);
}

function publicationKey(result: EuropePmcResult): string {
  return `${(result.source ?? "UNKNOWN").toUpperCase()}:${result.id ?? result.pmid ?? result.pmcid ?? result.doi ?? ""}`;
}

function publicationSubjectId(key: string): string {
  return `${SUBJECT_KIND}:${encodePart(key)}`;
}

function parsePublicationSubjectId(id: string): { source: string; externalId: string } {
  const raw = id.startsWith(`${SUBJECT_KIND}:`) ? id.slice(`${SUBJECT_KIND}:`.length) : id;
  const decoded = decodePart(raw).trim();
  const [source, ...rest] = decoded.split(":");
  const externalId = rest.join(":");
  if (!source || !externalId) throw new Error(`expected id '${SUBJECT_KIND}:<source>:<id>', got '${id}'`);
  return { source: source.toUpperCase(), externalId };
}

function authorsFromResult(result: EuropePmcResult): string[] {
  const fromList = result.authorList?.author?.map((author) => author.fullName ?? [author.firstName, author.lastName].filter(Boolean).join(" ")).filter(Boolean) ?? [];
  if (fromList.length > 0) return fromList;
  return (result.authorString ?? "").split(",").map((author) => author.trim()).filter(Boolean);
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? new Date(millis).toISOString() : undefined;
}

function truthyFlag(value: string | undefined): boolean {
  return value === "Y" || value === "true" || value === "1";
}

function nativeStatus(result: EuropePmcResult): string {
  return result.source ?? "publication";
}

function statusFromResult(_result: EuropePmcResult): SubjectStatus {
  return "done";
}

function priorityFromResult(result: EuropePmcResult): number {
  const citations = result.citedByCount ?? 0;
  if (citations >= 1000) return 0;
  if (citations >= 100) return 1;
  if (citations >= 10) return 2;
  return 3;
}

function labelsFromResult(config: Config, result: EuropePmcResult): string[] {
  const labels = new Set<string>(["europepmc", nativeStatus(result), `query:${config.query}`]);
  if (result.pubYear) labels.add(`year:${result.pubYear}`);
  if (result.journalTitle) labels.add(`journal:${result.journalTitle}`);
  if (truthyFlag(result.isOpenAccess)) labels.add("open-access");
  if (truthyFlag(result.inEPMC)) labels.add("in-epmc");
  for (const author of authorsFromResult(result).slice(0, 3)) labels.add(`author:${author}`);
  return [...labels];
}

function publicationUrl(result: EuropePmcResult): string | undefined {
  if (result.doi) return `https://doi.org/${result.doi}`;
  if (result.pmcid) return `https://europepmc.org/article/PMC/${result.pmcid.replace(/^PMC/i, "")}`;
  if (result.pmid) return `https://europepmc.org/article/MED/${result.pmid}`;
  if (result.id && result.source) return `https://europepmc.org/article/${result.source}/${result.id}`;
  return undefined;
}

function subjectFromResult(config: Config, result: EuropePmcResult, fetchedAt = new Date().toISOString()): Subject {
  const key = publicationKey(result);
  const authors = authorsFromResult(result);
  const updatedAt = toIso(result.firstIndexDate) ?? toIso(result.firstPublicationDate) ?? (result.pubYear ? `${result.pubYear}-01-01T00:00:00.000Z` : fetchedAt);
  return {
    id: publicationSubjectId(key),
    kind: SUBJECT_KIND,
    title: result.title ?? key,
    description: [result.journalTitle, result.authorString].filter(Boolean).join(" - ") || `Europe PMC publication ${key}`,
    status: statusFromResult(result),
    created_at: toIso(result.firstPublicationDate) ?? updatedAt,
    updated_at: updatedAt,
    labels: labelsFromResult(config, result),
    assignee: authors[0],
    url: publicationUrl(result),
    native_status: nativeStatus(result),
    priority: priorityFromResult(result),
    custom: {
      key,
      id: result.id,
      source: result.source,
      pmid: result.pmid,
      pmcid: result.pmcid,
      doi: result.doi,
      author_string: result.authorString,
      authors,
      journal_title: result.journalTitle,
      pub_year: result.pubYear,
      cited_by_count: result.citedByCount,
      is_open_access: truthyFlag(result.isOpenAccess),
      in_epmc: truthyFlag(result.inEPMC),
      has_references: truthyFlag(result.hasReferences),
      has_text_mined_terms: truthyFlag(result.hasTextMinedTerms),
      full_text_urls: result.fullTextUrlList?.fullTextUrl ?? [],
      raw: result,
    },
  };
}

function matchesConfiguredFilters(config: Config, result: EuropePmcResult): boolean {
  if (!config.localQuery) return true;
  const needle = config.localQuery.toLowerCase();
  const haystack = [
    publicationKey(result),
    result.title,
    result.authorString,
    result.journalTitle,
    result.doi,
    result.pmid,
    result.pmcid,
    result.source,
    ...authorsFromResult(result),
  ].join(" ").toLowerCase();
  return haystack.includes(needle);
}

function matchesFilters(config: Config, result: EuropePmcResult, params: SubjectListParams): boolean {
  if (!matchesConfiguredFilters(config, result)) return false;
  const subject = subjectFromResult(config, result);
  if (params.status && params.status.length > 0 && !params.status.includes(subject.status)) return false;
  if (params.assignee && params.assignee.length > 0 && (!subject.assignee || !params.assignee.includes(subject.assignee))) return false;
  const labels = new Set(subject.labels ?? []);
  if (params.labels_all && !params.labels_all.every((label) => labels.has(label))) return false;
  if (params.labels_any && params.labels_any.length > 0 && !params.labels_any.some((label) => labels.has(label))) return false;
  if (params.updated_since && new Date(subject.updated_at) < new Date(params.updated_since)) return false;
  return true;
}

class EuropePmcPublicationsClient {
  constructor(private readonly config: Config) {}

  async requestJson<T>(path: string, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const url = new URL(`${this.config.apiUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": `${NAME}/${VERSION} (https://github.com/launchapp-dev/${NAME}; mailto:opensource@launchapp.dev)`,
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Europe PMC API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
    return JSON.parse(text) as T;
  }

  async list(): Promise<EuropePmcResult[]> {
    const response = await this.requestJson<EuropePmcSearchResponse>("/search", {
      query: this.config.query,
      format: "json",
      pageSize: this.config.limit,
      sort: this.config.sort,
      resultType: this.config.resultType,
    });
    return response.resultList?.result ?? [];
  }

  async get(source: string, externalId: string): Promise<EuropePmcResult> {
    const response = await this.requestJson<EuropePmcSearchResponse>("/search", {
      query: `EXT_ID:${externalId} SRC:${source}`,
      format: "json",
      pageSize: 1,
    });
    const result = response.resultList?.result?.[0];
    if (!result) throw new Error(`Europe PMC publication not found: ${source}:${externalId}`);
    return result;
  }
}

function buildBackend(): SubjectBackend {
  let cached: { client: EuropePmcPublicationsClient; config: Config } | null = null;
  const runtime = (): { client: EuropePmcPublicationsClient; config: Config } => {
    if (!cached) {
      const config = readConfig();
      cached = { client: new EuropePmcPublicationsClient(config), config };
    }
    return cached;
  };
  return {
    async list(params) {
      const { client, config } = runtime();
      const results = await client.list();
      return {
        subjects: results.filter((result) => matchesFilters(config, result, params)).map((result) => subjectFromResult(config, result)),
        next_cursor: null,
        fetched_at: new Date().toISOString(),
      };
    },
    async get(params) {
      const { client, config } = runtime();
      const parsed = parsePublicationSubjectId(params.id);
      return subjectFromResult(config, await client.get(parsed.source, parsed.externalId));
    },
    schema() {
      return {
        kinds: [SUBJECT_KIND],
        status_values: ["ready", "in-progress", "blocked", "done", "cancelled"],
        supports_watch: false,
        supports_create: false,
        supports_pagination: false,
        native_status_values: ["MED", "PMC", "AGR", "PAT", "publication"],
        status_dispatch_hints: [{ native_status: "MED", status: "done" }],
        custom_fields: ["key", "id", "source", "pmid", "pmcid", "doi", "author_string", "authors", "journal_title", "pub_year", "cited_by_count", "is_open_access", "in_epmc", "has_references", "has_text_mined_terms", "full_text_urls", "raw"],
      };
    },
    async health() {
      try {
        const { client } = runtime();
        await client.list();
        return { status: "healthy", uptime_ms: null, memory_usage_bytes: null, last_error: null };
      } catch (err) {
        return { status: "unhealthy", uptime_ms: null, memory_usage_bytes: null, last_error: String(err) };
      }
    },
  };
}

export {
  EuropePmcPublicationsClient,
  authorsFromResult,
  labelsFromResult,
  matchesConfiguredFilters,
  matchesFilters,
  nativeStatus,
  parsePublicationSubjectId,
  priorityFromResult,
  publicationKey,
  publicationSubjectId,
  publicationUrl,
  statusFromResult,
  subjectFromResult,
  toIso,
  truthyFlag,
};

const plugin = definePlugin({
  kind: PluginKind.SubjectBackend,
  name: NAME,
  version: VERSION,
  description: "Europe PMC publications subject backend plugin for Animus",
  subject_kinds: [SUBJECT_KIND],
  env_required: [
    { name: "EUROPEPMC_QUERY", description: `Optional Europe PMC search query. Defaults to ${DEFAULT_QUERY}.`, required: false },
    { name: "EUROPEPMC_SORT", description: "Optional Europe PMC sort expression.", required: false },
    { name: "EUROPEPMC_RESULT_TYPE", description: "Optional result type, such as core or lite.", required: false },
    { name: "EUROPEPMC_API_URL", description: `Optional Europe PMC API base URL. Defaults to ${DEFAULT_API_URL}.`, required: false },
    { name: "EUROPEPMC_LOCAL_QUERY", description: "Optional local text query applied to publications after fetch.", required: false },
    { name: "EUROPEPMC_LIMIT", description: "Optional maximum publication count from 1 to 1000. Defaults to 50.", required: false },
  ],
  impl: buildBackend(),
});

function isDirectRun(): boolean {
  const entry = process.argv[1] ?? "";
  return entry.endsWith("index.cjs") || entry.endsWith("index.js") || entry.endsWith(NAME);
}

if (isDirectRun()) {
  plugin.run().catch((err) => {
    process.stderr.write(`[${NAME}] fatal: ${String(err)}\n`);
    process.exit(1);
  });
}
