/**
 * Search Result Types
 * Types for literature search results from PubMed, Crossref, etc.
 */

export type SearchResult = {
  pmid?: string;
  doi?: string;
  title: string;
  authors: string; // "Smith J, Doe A, Chen W"
  year?: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  abstract?: string;
  keywords?: string[]; // MeSH terms
  source: "pubmed" | "crossref" | "openalex" | "semantic-scholar";
  sourceUrl?: string;
  metadata?: Record<string, unknown>;
};

export type SearchResponse = {
  query: string;
  source: string;
  totalResults: number;
  returnedCount: number;
  results: SearchResult[];
  nextCursor?: string; // retstart for PubMed pagination
};
