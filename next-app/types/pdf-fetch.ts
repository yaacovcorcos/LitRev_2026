export type OpenAccessEvidence =
  | "unpaywall_is_oa"
  | "openalex_is_oa"
  | "europepmc_free_pdf";

export type OpenAccessProvider =
  | "unpaywall"
  | "openalex"
  | "europepmc";

export type OpenAccessPdfCandidate = {
  url: string;
  provider: OpenAccessProvider;
  evidence: OpenAccessEvidence;
  score: number;
  license?: string | null;
  hostType?: string | null;
  version?: string | null;
  sourceUrl?: string;
};

export type OpenAccessPdfResolverResult = {
  doi?: string;
  pmid?: string;
  pmcid?: string;
  candidates: OpenAccessPdfCandidate[];
  diagnostics: string[];
};

export type PdfDownloadErrorCode =
  | "UNSUPPORTED_PROTOCOL"
  | "BLOCKED_URL"
  | "TOO_MANY_REDIRECTS"
  | "HTTP_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "INVALID_PDF"
  | "NETWORK_ERROR";

export type OpenAccessPdfImportErrorCode =
  | "FEATURE_DISABLED"
  | "STUDY_NOT_FOUND"
  | "MISSING_IDENTIFIER"
  | "NO_OA_PDF_FOUND"
  | "PDF_DOWNLOAD_FAILED"
  | "PDF_BLOCKED"
  | "PDF_TOO_LARGE"
  | "INVALID_PDF"
  | "UNKNOWN_ERROR";
