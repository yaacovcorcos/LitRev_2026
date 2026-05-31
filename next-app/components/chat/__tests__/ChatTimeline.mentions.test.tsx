// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ChatTimeline } from "../ChatTimeline";
import { clearCitationMetadataClientCache } from "@/lib/citation-preview-cache";
import type { TimelineItem } from "@/types/timeline";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

const addMentionedStudyAction = vi.fn();
vi.mock("@/app/actions/ledger", () => ({
  addMentionedStudyAction: (...args: unknown[]) => addMentionedStudyAction(...args),
}));

const fetchCitationMetadata = vi.fn();
vi.mock("@/app/actions/citation", () => ({
  fetchCitationMetadata: (...args: unknown[]) => fetchCitationMetadata(...args),
}));

vi.mock("@/lib/agent/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/feature-flags")>("@/lib/agent/feature-flags");
  return {
    ...actual,
    isChatStudyMentionsEnabled: () => true,
  };
});

describe("ChatTimeline mention and metadata behavior", () => {
  function getMentionedStudiesRow(): HTMLElement {
    const label = screen.getByText("Mentioned studies");
    const row = label.parentElement;
    if (!row) {
      throw new Error("Mentioned studies row not found");
    }
    return row;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    clearCitationMetadataClientCache();
  });

  it("strips hidden metadata blocks from rendered assistant text", () => {
    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: `Visible narrative\n\n<!-- SCOPING_REPORT: {\"topic\":\"x\"} -->\n<!-- MENTIONED_STUDIES: {\"studies\":[{\"title\":\"Study\",\"doi\":\"10.1000/x\"}]} -->`,
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    expect(screen.getByText("Visible narrative")).not.toBeNull();
    expect(screen.queryByText(/SCOPING_REPORT/i)).toBeNull();
    expect(screen.queryByText(/MENTIONED_STUDIES/i)).toBeNull();
  });

  it("strips open mentioned-studies comments from rendered assistant text", () => {
    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: 'Visible narrative\n\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study","doi":"10.1000/x"}]}',
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    expect(screen.getByText("Visible narrative")).not.toBeNull();
    expect(screen.queryByText(/MENTIONED_STUDIES/i)).toBeNull();
    expect(screen.getByText("Mentioned studies")).not.toBeNull();
    expect(screen.getByText("Study")).not.toBeNull();
  });

  it("renders mentioned-study chips and supports one-click add", async () => {
    addMentionedStudyAction.mockResolvedValue({ success: true, data: {
      created: true,
      study: { id: "study-1", title: "Turner et al. 2016" },
    } });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [Turner et al. 2016](https://doi.org/10.1097/j.pain.0000000000000635)",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    const addBtn = screen.getByRole("button", { name: "Add to ledger" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(addMentionedStudyAction).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("button", { name: "Added" })).not.toBeNull();
    });

    expect(addMentionedStudyAction).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ doi: "10.1097/j.pain.0000000000000635" })
    );
  }, 30000);

  it("shows already-in-ledger state when server reports duplicate", async () => {
    addMentionedStudyAction.mockResolvedValue({ success: true, data: {
      created: false,
      matchedBy: "doi",
      study: { id: "study-1", title: "Turner et al. 2016" },
    } });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [Turner et al. 2016](https://doi.org/10.1097/j.pain.0000000000000635)",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Add to ledger" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Already in ledger" })).not.toBeNull();
    });
  });

  it("prefers structured mentioned-study metadata over generic markdown labels", async () => {
    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: `See [DOI](https://doi.org/10.1000/xyz123)\n\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Structured Study Title","doi":"10.1000/xyz123","sourceUrl":"https://doi.org/10.1000/xyz123"}]} -->`,
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    const mentionsRow = getMentionedStudiesRow();
    expect(within(mentionsRow).getByText("Structured Study Title")).not.toBeNull();
    expect(within(mentionsRow).queryByText(/^DOI$/)).toBeNull();
  });

  it("hydrates untitled DOI mention chips from citation metadata", async () => {
    fetchCitationMetadata.mockResolvedValue({
      success: true,
      data: {
        title: "Hydrated DOI Study",
        authors: "Author One",
        doi: "10.1000/xyz123",
      },
      meta: {
        diagnostics: {
          resolutionPath: "doi_crossref",
          reason: "count_resolved",
          resolvedWithCitationCount: true,
          hadDoiFallbackCandidate: false,
        },
      },
    });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [DOI](https://doi.org/10.1000/xyz123)",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Hydrated DOI Study")).not.toBeNull();
    });
    expect(within(getMentionedStudiesRow()).queryByText(/^DOI$/)).toBeNull();
  });

  it("hydrates untitled PubMed mention chips from citation metadata", async () => {
    fetchCitationMetadata.mockResolvedValue({
      success: true,
      data: {
        title: "Hydrated PubMed Study",
        authors: "Author Two",
        pmid: "40010103",
      },
      meta: {
        diagnostics: {
          resolutionPath: "pubmed_bibliography_only",
          reason: "no_doi_fallback",
          resolvedWithCitationCount: false,
          hadDoiFallbackCandidate: false,
        },
      },
    });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [PubMed](https://pubmed.ncbi.nlm.nih.gov/40010103/)",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Hydrated PubMed Study")).not.toBeNull();
    });
    expect(within(getMentionedStudiesRow()).queryByText(/^PubMed$/)).toBeNull();
  });

  it("falls back to identifier text when mention hydration fails", async () => {
    fetchCitationMetadata.mockResolvedValue({
      success: false,
      error: "Unable to resolve citation",
    });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [DOI](https://doi.org/10.1000/xyz123) and [PubMed](https://pubmed.ncbi.nlm.nih.gov/40010103/)",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(fetchCitationMetadata).toHaveBeenCalledTimes(2);
    });

    const mentionsRow = getMentionedStudiesRow();
    expect(within(mentionsRow).getByText("10.1000/xyz123")).not.toBeNull();
    expect(within(mentionsRow).getByText("PMID 40010103")).not.toBeNull();
    expect(within(mentionsRow).queryByText(/^DOI$/)).toBeNull();
    expect(within(mentionsRow).queryByText(/^PubMed$/)).toBeNull();
  });

  it("dedupes citation metadata requests for repeated untitled DOI mentions", async () => {
    fetchCitationMetadata.mockResolvedValue({
      success: true,
      data: {
        title: "Shared DOI Study",
        authors: "Author One",
        doi: "10.1000/xyz123",
      },
      meta: {
        diagnostics: {
          resolutionPath: "doi_crossref",
          reason: "count_resolved",
          resolvedWithCitationCount: true,
          hadDoiFallbackCandidate: false,
        },
      },
    });

    const items: TimelineItem[] = [
      {
        type: "assistant_message",
        id: "a1",
        createdAt: "2026-02-21T00:00:00.000Z",
        content: "See [DOI](https://doi.org/10.1000/xyz123)",
      },
      {
        type: "assistant_message",
        id: "a2",
        createdAt: "2026-02-21T00:01:00.000Z",
        content: "Related: [DOI](https://doi.org/10.1000/xyz123)",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getAllByText("Shared DOI Study")).toHaveLength(2);
    });
    expect(fetchCitationMetadata).toHaveBeenCalledTimes(1);
  });
});
