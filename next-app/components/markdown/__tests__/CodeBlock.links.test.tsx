// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../CodeBlock";

describe("markdown link rendering", () => {
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
});
