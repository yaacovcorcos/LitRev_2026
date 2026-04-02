import { beforeEach, describe, expect, it, vi } from "vitest";
import { addToLedgerTool } from "@/lib/server/ai/tools/add-to-ledger";

const { listStudiesMock, upsertStudyMock } = vi.hoisted(() => ({
  listStudiesMock: vi.fn(),
  upsertStudyMock: vi.fn(),
}));

vi.mock("@/lib/server/ledger", () => ({
  listStudies: listStudiesMock,
  upsertStudy: upsertStudyMock,
}));

describe("addToLedgerTool", () => {
  beforeEach(() => {
    listStudiesMock.mockReset();
    upsertStudyMock.mockReset();
    listStudiesMock.mockResolvedValue([]);
    upsertStudyMock.mockResolvedValue(undefined);
  });

  it("accepts results that omit year in the input schema", () => {
    const parsed = addToLedgerTool.inputSchema!.safeParse({
      results: [
        {
          title: "Missing Year Study",
          authors: "Doe A",
          source: "pubmed",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("adds only ledger-eligible results and reports missing-year skips", async () => {
    const result = await addToLedgerTool.execute(
      {
        results: [
          {
            title: "Eligible Study",
            authors: "Smith J",
            year: 2024,
            pmid: "12345678",
            source: "pubmed",
          },
          {
            title: "Yearless Study",
            authors: "Doe A",
            source: "pubmed",
          },
        ],
      },
      { projectId: "project-1" }
    );

    expect(listStudiesMock).toHaveBeenCalledWith(undefined, "project-1");
    expect(upsertStudyMock).toHaveBeenCalledTimes(1);
    expect(upsertStudyMock).toHaveBeenCalledWith(
      undefined,
      "project-1",
      expect.objectContaining({
        title: "Eligible Study",
        year: 2024,
      })
    );
    expect(result).toEqual({
      callId: "",
      result: {
        added: 1,
        duplicatesSkipped: 0,
        missingYearSkipped: 1,
        titles: ["Eligible Study"],
        duplicateDetails: [],
        missingYearTitles: ["Yearless Study"],
      },
    });
  });

  it("reports all-yearless batches truthfully without failing", async () => {
    const result = await addToLedgerTool.execute(
      {
        results: [
          {
            title: "Yearless Study",
            authors: "Doe A",
            source: "pubmed",
          },
        ],
      },
      { projectId: "project-1" }
    );

    expect(upsertStudyMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      callId: "",
      result: {
        added: 0,
        duplicatesSkipped: 0,
        missingYearSkipped: 1,
        titles: [],
        duplicateDetails: [],
        missingYearTitles: ["Yearless Study"],
      },
    });
  });

  it("combines duplicate and missing-year reporting in one response", async () => {
    listStudiesMock.mockResolvedValue([
      {
        id: "study-1",
        title: "Existing Study",
        authors: "Smith J",
        year: 2023,
        status: "pending",
        quality: "-",
        details: { pmid: "99999999" },
      },
    ]);

    const result = await addToLedgerTool.execute(
      {
        results: [
          {
            title: "Existing Study Duplicate",
            authors: "Smith J",
            pmid: "99999999",
            source: "pubmed",
          },
          {
            title: "Yearless Study",
            authors: "Doe A",
            source: "pubmed",
          },
        ],
      },
      { projectId: "project-1" }
    );

    expect(upsertStudyMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      callId: "",
      result: {
        added: 0,
        duplicatesSkipped: 1,
        missingYearSkipped: 1,
        titles: [],
        duplicateDetails: [
          {
            title: "Existing Study Duplicate",
            matchedBy: "pmid",
            matchedValue: "99999999",
            existingTitle: "Existing Study",
          },
        ],
        missingYearTitles: ["Yearless Study"],
      },
    });
  });
});
