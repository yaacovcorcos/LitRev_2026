// @vitest-environment jsdom
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../CodeBlock";
import { fetchCitationMetadata } from "@/app/actions/citation";

vi.mock("@/components/ui/Popover", async () => {
    const React = await import("react");
    return {
        Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
        Content: () => null,
        Arrow: () => null,
    };
});

// Mock the citation action
vi.mock("@/app/actions/citation", () => ({
    fetchCitationMetadata: vi.fn().mockResolvedValue({
        success: true,
        data: {
            title: "Test Citation Title",
            authors: "Smith J, Doe A",
            year: 2024,
            journal: "Test Journal",
            canonicalUrl: "https://doi.org/10.1000/xyz123",
            doi: "10.1000/xyz123",
        },
    }),
}));

describe("markdown link rendering", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("renders DOI label for doi.org links", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Some Study](https://doi.org/10.1000/xyz123)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "DOI" });
        expect(link.getAttribute("href")).toBe("https://doi.org/10.1000/xyz123");
    });

    it("renders PubMed label for pubmed links", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Study](https://pubmed.ncbi.nlm.nih.gov/40010103/)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "PubMed" });
        expect(link.getAttribute("href")).toBe("https://pubmed.ncbi.nlm.nih.gov/40010103/");
    });

    it("keeps original label for non-citation links", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Open site](https://example.com/path)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "Open site" });
        expect(link.getAttribute("href")).toBe("https://example.com/path");
    });

    it("does not falsely label links that only contain doi.org in query params", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Original](https://evil.example/?next=https://doi.org/10.1000/xyz123)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "Original" });
        expect(link.getAttribute("href")).toBe("https://evil.example/?next=https://doi.org/10.1000/xyz123");
    });

    it("renders citation links with data-citation-type attribute", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Study](https://doi.org/10.1000/xyz123)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "DOI" });
        expect(link.getAttribute("data-citation-type")).toBe("DOI");
    });

    it("renders PubMed links with data-citation-type attribute", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Study](https://pubmed.ncbi.nlm.nih.gov/12345678/)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "PubMed" });
        expect(link.getAttribute("data-citation-type")).toBe("PubMed");
    });

    it("recognizes dx.doi.org as DOI links", () => {
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Study](https://dx.doi.org/10.1000/xyz123)"}
            </ReactMarkdown>
        );
        const link = screen.getByRole("link", { name: "DOI" });
        expect(link.getAttribute("href")).toBe("https://dx.doi.org/10.1000/xyz123");
        expect(link.getAttribute("data-citation-type")).toBe("DOI");
    });

    it("fetches citation metadata lazily on hover intent", async () => {
        vi.useFakeTimers();
        render(
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                {"[Study](https://doi.org/10.1000/xyz123)"}
            </ReactMarkdown>
        );

        const link = screen.getByRole("link", { name: "DOI" });
        const mockedFetch = vi.mocked(fetchCitationMetadata);

        expect(mockedFetch).not.toHaveBeenCalled();

        act(() => {
            fireEvent.mouseEnter(link);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(380);
            // Flush promise chains started inside the hover-intent timer callback.
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(mockedFetch).toHaveBeenCalledWith("https://doi.org/10.1000/xyz123");
    });
});
