import "server-only";

import type {
  OpenAccessPdfCandidate,
  OpenAccessPdfResolverResult,
} from "@/types/pdf-fetch";

const UNPAYWALL_BASE = "https://api.unpaywall.org/v2";
const OPENALEX_BASE = "https://api.openalex.org";
const EUROPE_PMC_BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";
const PMC_IDCONV_BASE = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/";

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\s*:\s*/i, "")
    .replace(/[),.;:\]]+$/g, "")
    .toLowerCase();
  if (!/^10\.\d{4,9}\/.+/.test(normalized)) return undefined;
  return normalized;
}

function normalizePmid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 9) return undefined;
  return digits;
}

function normalizePmcid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toUpperCase();
  if (!/^PMC\d+$/.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeHttpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function withOpenAlexAuth(params: URLSearchParams): URLSearchParams {
  const copy = new URLSearchParams(params);
  const apiKey = process.env.OPENALEX_API_KEY?.trim();
  const mailto = process.env.OPENALEX_MAILTO?.trim() || process.env.NCBI_EMAIL?.trim();
  if (apiKey) copy.set("api_key", apiKey);
  if (mailto) copy.set("mailto", mailto);
  return copy;
}

function getUnpaywallEmail(): string {
  return (
    process.env.UNPAYWALL_EMAIL?.trim() ||
    process.env.NCBI_EMAIL?.trim() ||
    "support@litrev.app"
  );
}

function pushUniqueCandidate(
  list: OpenAccessPdfCandidate[],
  candidate: OpenAccessPdfCandidate
): void {
  const url = normalizeHttpUrl(candidate.url);
  if (!url) return;
  if (list.some((c) => c.url === url)) return;
  list.push({ ...candidate, url });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

async function resolveFromUnpaywall(doi: string): Promise<OpenAccessPdfCandidate[]> {
  const email = encodeURIComponent(getUnpaywallEmail());
  const url = `${UNPAYWALL_BASE}/${encodeURIComponent(doi)}?email=${email}`;
  const data = (await fetchJson(url)) as {
    is_oa?: boolean;
    best_oa_location?: {
      url_for_pdf?: string | null;
      license?: string | null;
      host_type?: string | null;
      version?: string | null;
      url_for_landing_page?: string | null;
    } | null;
    oa_locations?: Array<{
      url_for_pdf?: string | null;
      license?: string | null;
      host_type?: string | null;
      version?: string | null;
      url_for_landing_page?: string | null;
    }>;
  };

  if (!data?.is_oa) return [];

  const candidates: OpenAccessPdfCandidate[] = [];
  const locations = [
    ...(data.best_oa_location ? [data.best_oa_location] : []),
    ...(Array.isArray(data.oa_locations) ? data.oa_locations : []),
  ];

  for (const location of locations) {
    const pdfUrl = normalizeHttpUrl(location?.url_for_pdf ?? undefined);
    if (!pdfUrl) continue;
    pushUniqueCandidate(candidates, {
      url: pdfUrl,
      provider: "unpaywall",
      evidence: "unpaywall_is_oa",
      score: 90,
      license: location?.license ?? undefined,
      hostType: location?.host_type ?? undefined,
      version: location?.version ?? undefined,
      sourceUrl: location?.url_for_landing_page ?? undefined,
    });
  }

  return candidates;
}

type OpenAlexWork = {
  primary_location?: {
    pdf_url?: string | null;
    landing_page_url?: string | null;
    source?: { type?: string | null } | null;
    license?: string | null;
    version?: string | null;
  } | null;
  open_access?: {
    is_oa?: boolean;
    oa_url?: string | null;
  } | null;
};

async function fetchOpenAlexWork(
  doi: string | undefined,
  pmid: string | undefined
): Promise<OpenAlexWork | null> {
  if (doi) {
    const id = encodeURIComponent(`https://doi.org/${doi}`);
    const params = withOpenAlexAuth(new URLSearchParams());
    const suffix = params.toString();
    const url = `${OPENALEX_BASE}/works/${id}${suffix ? `?${suffix}` : ""}`;
    return (await fetchJson(url)) as OpenAlexWork;
  }

  if (!pmid) return null;

  const params = withOpenAlexAuth(
    new URLSearchParams({
      filter: `ids.pmid:https://pubmed.ncbi.nlm.nih.gov/${pmid}`,
      "per-page": "1",
    })
  );
  const url = `${OPENALEX_BASE}/works?${params.toString()}`;
  const data = (await fetchJson(url)) as { results?: OpenAlexWork[] };
  return data?.results?.[0] ?? null;
}

async function resolveFromOpenAlex(
  doi: string | undefined,
  pmid: string | undefined
): Promise<OpenAccessPdfCandidate[]> {
  const work = await fetchOpenAlexWork(doi, pmid);
  if (!work?.open_access?.is_oa) return [];

  const candidates: OpenAccessPdfCandidate[] = [];
  const primaryPdf = normalizeHttpUrl(work.primary_location?.pdf_url ?? undefined);
  const oaUrl = normalizeHttpUrl(work.open_access?.oa_url ?? undefined);

  if (primaryPdf) {
    pushUniqueCandidate(candidates, {
      url: primaryPdf,
      provider: "openalex",
      evidence: "openalex_is_oa",
      score: 80,
      license: work.primary_location?.license ?? undefined,
      hostType: work.primary_location?.source?.type ?? undefined,
      version: work.primary_location?.version ?? undefined,
      sourceUrl: work.primary_location?.landing_page_url ?? undefined,
    });
  }

  if (oaUrl) {
    pushUniqueCandidate(candidates, {
      url: oaUrl,
      provider: "openalex",
      evidence: "openalex_is_oa",
      score: 78,
      license: work.primary_location?.license ?? undefined,
      hostType: work.primary_location?.source?.type ?? undefined,
      version: work.primary_location?.version ?? undefined,
      sourceUrl: work.primary_location?.landing_page_url ?? undefined,
    });
  }

  return candidates;
}

async function resolvePmcid(
  doi: string | undefined,
  pmid: string | undefined
): Promise<string | undefined> {
  const candidateIds = Array.from(new Set([doi, pmid].filter((id): id is string => Boolean(id))));
  if (candidateIds.length === 0) return undefined;

  let lastError: unknown = null;
  let hadSuccessfulLookup = false;
  for (const id of candidateIds) {
    try {
      const params = new URLSearchParams({
        ids: id,
        format: "json",
        tool: "litrev",
        email: getUnpaywallEmail(),
      });
      const url = `${PMC_IDCONV_BASE}?${params.toString()}`;
      const data = (await fetchJson(url)) as {
        records?: Array<{ pmcid?: string }>;
      };
      hadSuccessfulLookup = true;
      const pmcid = normalizePmcid(data?.records?.[0]?.pmcid);
      if (pmcid) return pmcid;
    } catch (error) {
      lastError = error;
    }
  }

  if (!hadSuccessfulLookup && lastError) throw lastError;
  return undefined;
}

async function resolveFromEuropePmc(
  pmcid: string | undefined
): Promise<OpenAccessPdfCandidate[]> {
  if (!pmcid) return [];
  const params = new URLSearchParams({
    query: `PMCID:${pmcid}`,
    format: "json",
    pageSize: "1",
    resultType: "core",
  });
  const url = `${EUROPE_PMC_BASE}/search?${params.toString()}`;
  const data = (await fetchJson(url)) as {
    resultList?: {
      result?: Array<{
        fullTextUrlList?: {
          fullTextUrl?:
            | Array<{
                availabilityCode?: string;
                documentStyle?: string;
                url?: string;
              }>
            | {
                availabilityCode?: string;
                documentStyle?: string;
                url?: string;
              };
        };
      }>;
    };
  };

  const entry = data?.resultList?.result?.[0];
  const rawUrls = entry?.fullTextUrlList?.fullTextUrl;
  const fullTextUrls = Array.isArray(rawUrls)
    ? rawUrls
    : rawUrls
    ? [rawUrls]
    : [];

  const candidates: OpenAccessPdfCandidate[] = [];
  for (const fullTextUrl of fullTextUrls) {
    const availabilityCode = (fullTextUrl?.availabilityCode ?? "").toUpperCase();
    const style = (fullTextUrl?.documentStyle ?? "").toLowerCase();
    if (availabilityCode !== "F" || style !== "pdf") continue;
    const pdfUrl = normalizeHttpUrl(fullTextUrl.url ?? undefined);
    if (!pdfUrl) continue;
    pushUniqueCandidate(candidates, {
      url: pdfUrl,
      provider: "europepmc",
      evidence: "europepmc_free_pdf",
      score: 100,
      sourceUrl: `https://europepmc.org/articles/${pmcid}`,
    });
  }
  return candidates;
}

function sortCandidates(candidates: OpenAccessPdfCandidate[]): OpenAccessPdfCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.url.localeCompare(b.url);
  });
}

function dedupeCandidates(candidates: OpenAccessPdfCandidate[]): OpenAccessPdfCandidate[] {
  const seen = new Set<string>();
  const deduped: OpenAccessPdfCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.url;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

export async function resolveOpenAccessPdfCandidates(input: {
  doi?: string;
  pmid?: string;
}): Promise<OpenAccessPdfResolverResult> {
  const doi = normalizeDoi(input.doi);
  const pmid = normalizePmid(input.pmid);
  const diagnostics: string[] = [];

  if (!doi && !pmid) {
    diagnostics.push("No valid DOI or PMID provided.");
    return { candidates: [], diagnostics };
  }

  const candidates: OpenAccessPdfCandidate[] = [];
  let pmcid: string | undefined;

  if (doi) {
    try {
      const fromUnpaywall = await resolveFromUnpaywall(doi);
      candidates.push(...fromUnpaywall);
    } catch (error) {
      diagnostics.push(
        `Unpaywall lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  try {
    const fromOpenAlex = await resolveFromOpenAlex(doi, pmid);
    candidates.push(...fromOpenAlex);
  } catch (error) {
    diagnostics.push(
      `OpenAlex lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  try {
    pmcid = await resolvePmcid(doi, pmid);
  } catch (error) {
    diagnostics.push(
      `PMCID lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  if (pmcid) {
    try {
      const fromEuropePmc = await resolveFromEuropePmc(pmcid);
      candidates.push(...fromEuropePmc);
    } catch (error) {
      diagnostics.push(
        `Europe PMC lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  const deduped = dedupeCandidates(sortCandidates(candidates));
  return {
    doi: doi ?? undefined,
    pmid: pmid ?? undefined,
    pmcid,
    candidates: deduped,
    diagnostics,
  };
}
