import { afterEach, describe, expect, it, vi } from "vitest";
import { parseOpenAlexWork, searchOpenAlex } from "@/lib/server/search/openalex";

function mockJsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Response;
}

describe("parseOpenAlexWork", () => {
  it("normalizes identifiers and reconstructs abstract text", () => {
    const result = parseOpenAlexWork({
      id: "https://openalex.org/W123",
      doi: "https://doi.org/10.1000/XYZ",
      ids: {
        pmid: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
      },
      display_name: "OpenAlex Test Paper",
      publication_year: 2024,
      authorships: [
        { author: { display_name: "Alice Example" } },
        { author: { display_name: "Bob Example" } },
      ],
      primary_location: {
        source: { display_name: "Journal of Tests" },
      },
      biblio: {
        volume: "12",
        issue: "3",
        first_page: "100",
        last_page: "112",
      },
      abstract_inverted_index: {
        This: [0],
        is: [1],
        reconstructed: [2],
      },
      concepts: [{ display_name: "Machine Learning", score: 0.8 }],
      cited_by_count: 15,
      open_access: { is_oa: true },
      type: "article",
    });

    expect(result.source).toBe("openalex");
    expect(result.doi).toBe("10.1000/xyz");
    expect(result.pmid).toBe("12345678");
    expect(result.authors).toBe("Alice Example, Bob Example");
    expect(result.abstract).toBe("This is reconstructed");
    expect(result.journal).toBe("Journal of Tests");
    expect(result.pages).toBe("100-112");
    expect(result.keywords).toContain("Machine Learning");
    expect(result.metadata?.openAlexId).toBe("https://openalex.org/W123");
  });

  it("preserves an unknown year when OpenAlex does not provide one", () => {
    const result = parseOpenAlexWork({
      id: "https://openalex.org/W999",
      display_name: "Yearless OpenAlex Paper",
      publication_year: null,
      publication_date: null,
      authorships: [{ author: { display_name: "Alice Example" } }],
    });

    expect(result.year).toBeUndefined();
    expect(result.metadata?.yearEstimated).toBeUndefined();
  });

  it("rejects malformed publication_date values instead of coercing partial numeric years", () => {
    const malformedAlpha = parseOpenAlexWork({
      id: "https://openalex.org/W998",
      display_name: "Malformed Alpha Date",
      publication_year: null,
      publication_date: "20XX-01-01",
      authorships: [{ author: { display_name: "Alice Example" } }],
    });
    const malformedShort = parseOpenAlexWork({
      id: "https://openalex.org/W997",
      display_name: "Malformed Short Date",
      publication_year: null,
      publication_date: "202X",
      authorships: [{ author: { display_name: "Bob Example" } }],
    });

    expect(malformedAlpha.year).toBeUndefined();
    expect(malformedShort.year).toBeUndefined();
  });
});

describe("searchOpenAlex", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns normalized OpenAlex search response with cursor", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({
          meta: { count: 2, next_cursor: "cursor-2" },
          results: [
            {
              id: "https://openalex.org/W1",
              display_name: "Paper A",
              publication_year: 2020,
              authorships: [{ author: { display_name: "Author A" } }],
              ids: { doi: "https://doi.org/10.1111/a" },
              primary_location: { source: { display_name: "Journal A" } },
            },
            {
              id: "https://openalex.org/W2",
              display_name: "Paper B",
              publication_year: 2021,
              authorships: [{ author: { display_name: "Author B" } }],
              ids: { doi: "https://doi.org/10.1111/b" },
              primary_location: { source: { display_name: "Journal B" } },
            },
          ],
        })
      );

    const response = await searchOpenAlex("sleep quality", { maxResults: 2, cursor: "*" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.source).toBe("openalex");
    expect(response.totalResults).toBe(2);
    expect(response.returnedCount).toBe(2);
    expect(response.nextCursor).toBe("cursor-2");
    expect(response.results[0].title).toBe("Paper A");
    expect(response.results[0].source).toBe("openalex");
  });

  it("applies yearRange filtering and enriches sparse DOI records with Crossref fallback", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({
          meta: { count: 2, next_cursor: null },
          results: [
            {
              id: "https://openalex.org/W10",
              display_name: "Sparse Metadata Paper",
              publication_year: 2022,
              ids: { doi: "https://doi.org/10.2222/sparse" },
              authorships: [],
            },
            {
              id: "https://openalex.org/W11",
              display_name: "Out Of Range Paper",
              publication_year: 2018,
              ids: { doi: "https://doi.org/10.2222/old" },
              authorships: [{ author: { display_name: "Old Author" } }],
              primary_location: { source: { display_name: "Old Journal" } },
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          message: {
            title: ["Recovered Crossref Title"],
            author: [{ family: "Lee", given: "Ann" }],
            "container-title": ["Recovered Journal"],
            "published-online": { "date-parts": [[2022, 1, 1]] },
          },
        })
      );

    const response = await searchOpenAlex("sparse", { yearRange: "2020-2024" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.totalResults).toBeUndefined();
    expect(response.returnedCount).toBe(1);
    expect(response.results[0].title).toBe("Sparse Metadata Paper");
    expect(response.results[0].authors).toBe("Lee Ann");
    expect(response.results[0].journal).toBe("Recovered Journal");
    expect(response.results[0].metadata?.crossrefEnriched).toBe(true);
  });

  it("excludes unknown-year results when a year range is requested", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      mockJsonResponse({
        meta: { count: 2, next_cursor: null },
        results: [
          {
            id: "https://openalex.org/W20",
            display_name: "Unknown Year Paper",
            publication_year: null,
            publication_date: null,
            authorships: [{ author: { display_name: "Unknown Author" } }],
          },
          {
            id: "https://openalex.org/W21",
            display_name: "Known Year Paper",
            publication_year: 2023,
            authorships: [{ author: { display_name: "Known Author" } }],
          },
        ],
      })
    );

    const response = await searchOpenAlex("year filter", { yearRange: "2020-2024" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.totalResults).toBeUndefined();
    expect(response.returnedCount).toBe(1);
    expect(response.results.map((result) => result.title)).toEqual(["Known Year Paper"]);
  });

  it("can recover a missing year from Crossref before year-range filtering", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({
          meta: { count: 1, next_cursor: null },
          results: [
            {
              id: "https://openalex.org/W30",
              display_name: "Recoverable Year Paper",
              publication_year: null,
              publication_date: null,
              ids: { doi: "https://doi.org/10.3333/recoverable" },
              authorships: [],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        mockJsonResponse({
          message: {
            title: ["Recovered Title"],
            author: [{ family: "Smith", given: "Jo" }],
            "container-title": ["Recovered Journal"],
            "published-online": { "date-parts": [[2021, 1, 1]] },
          },
        })
      );

    const response = await searchOpenAlex("recoverable", { yearRange: "2020-2024" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.totalResults).toBeUndefined();
    expect(response.returnedCount).toBe(1);
    expect(response.results[0]?.year).toBe(2021);
    expect(response.results[0]?.metadata?.crossrefEnriched).toBe(true);
  });

  it("returns base OpenAlex results when optional Crossref enrichment times out", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({
          meta: { count: 1, next_cursor: null },
          results: [
            {
              id: "https://openalex.org/W40",
              display_name: "Sparse But Usable Paper",
              publication_year: 2023,
              ids: { doi: "https://doi.org/10.4444/slow" },
              authorships: [],
            },
          ],
        })
      )
      .mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      }));

    const response = await searchOpenAlex("slow crossref", { yearRange: "2020-2024" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.returnedCount).toBe(1);
    expect(response.results[0]?.title).toBe("Sparse But Usable Paper");
    expect(response.results[0]?.authors).toBe("Unknown");
    expect(response.results[0]?.metadata?.crossrefEnriched).toBeUndefined();
  }, 5_000);

  it("aborts Crossref enrichment promptly when the caller cancels OpenAlex search", async () => {
    const controller = new AbortController();
    let startCrossref!: () => void;
    const crossrefStarted = new Promise<void>((resolve) => {
      startCrossref = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockJsonResponse({
          meta: { count: 1, next_cursor: null },
          results: [
            {
              id: "https://openalex.org/W50",
              display_name: "Sparse Abort Paper",
              publication_year: 2023,
              ids: { doi: "https://doi.org/10.5555/abort" },
              authorships: [],
            },
          ],
        })
      )
      .mockImplementationOnce((_input, init) => new Promise<Response>((_resolve, reject) => {
        startCrossref();
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        }, { once: true });
      }));

    const searchPromise = searchOpenAlex("abort crossref", {
      yearRange: "2020-2024",
      signal: controller.signal,
    });

    await crossrefStarted;
    controller.abort();

    await expect(searchPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
