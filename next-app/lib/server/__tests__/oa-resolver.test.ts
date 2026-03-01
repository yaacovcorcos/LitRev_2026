import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveOpenAccessPdfCandidates } from "@/lib/server/search/oa-resolver";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("resolveOpenAccessPdfCandidates", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates OA candidates across providers and ranks them", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("api.unpaywall.org")) {
        return jsonResponse({
          is_oa: true,
          best_oa_location: {
            url_for_pdf: "https://publisher.example/paper.pdf",
            host_type: "publisher",
            license: null,
          },
          oa_locations: [{ url_for_pdf: "https://publisher.example/paper.pdf" }],
        });
      }

      if (url.includes("api.openalex.org/works/")) {
        return jsonResponse({
          open_access: { is_oa: true, oa_url: "https://repo.example/preprint.pdf" },
          primary_location: {
            pdf_url: "https://repo.example/preprint.pdf",
            landing_page_url: "https://repo.example/work",
            source: { type: "repository" },
          },
        });
      }

      if (url.includes("tools/idconv")) {
        return jsonResponse({
          records: [{ pmcid: "PMC1234567" }],
        });
      }

      if (url.includes("europepmc")) {
        return jsonResponse({
          resultList: {
            result: [
              {
                fullTextUrlList: {
                  fullTextUrl: [
                    {
                      availabilityCode: "F",
                      documentStyle: "pdf",
                      url: "https://europepmc.org/articles/PMC1234567?pdf=render",
                    },
                  ],
                },
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const result = await resolveOpenAccessPdfCandidates({ doi: "10.1234/Test.001" });

    expect(result.doi).toBe("10.1234/test.001");
    expect(result.pmcid).toBe("PMC1234567");
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].provider).toBe("europepmc");
    expect(result.candidates[1].provider).toBe("unpaywall");
    expect(result.candidates[2].provider).toBe("openalex");
  });

  it("returns empty when identifiers are invalid", async () => {
    const result = await resolveOpenAccessPdfCandidates({ doi: "not-a-doi", pmid: "12" });
    expect(result.candidates).toEqual([]);
    expect(result.diagnostics[0]).toContain("No valid DOI or PMID");
  });

  it("falls back to PMID for PMCID lookup when DOI-based lookup has no PMCID", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("api.unpaywall.org")) {
        return jsonResponse({ is_oa: false });
      }

      if (url.includes("api.openalex.org/works/")) {
        return jsonResponse({
          open_access: { is_oa: false },
        });
      }

      if (url.includes("tools/idconv")) {
        if (url.includes("ids=10.9999%2Fabc.def")) {
          return jsonResponse({ records: [{}] });
        }
        if (url.includes("ids=12345678")) {
          return jsonResponse({ records: [{ pmcid: "PMC7654321" }] });
        }
      }

      if (url.includes("europepmc")) {
        return jsonResponse({
          resultList: {
            result: [
              {
                fullTextUrlList: {
                  fullTextUrl: [
                    {
                      availabilityCode: "F",
                      documentStyle: "pdf",
                      url: "https://europepmc.org/articles/PMC7654321?pdf=render",
                    },
                  ],
                },
              },
            ],
          },
        });
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock as typeof fetch);

    const result = await resolveOpenAccessPdfCandidates({
      doi: "10.9999/ABC.DEF",
      pmid: "12345678",
    });

    expect(result.pmcid).toBe("PMC7654321");
    expect(result.candidates[0]?.provider).toBe("europepmc");
    const idconvCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("tools/idconv"));
    expect(idconvCalls).toHaveLength(2);
  });
});
