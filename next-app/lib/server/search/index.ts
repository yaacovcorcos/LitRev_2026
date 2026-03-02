export { searchPubMed, fetchPubMedArticles, parsePubMedXml } from "./pubmed";
export { searchSemanticScholar, getRecommendations, parseS2Paper, buildS2PaperIds, type S2Paper } from "./semantic-scholar";
export { searchOpenAlex, parseOpenAlexWork } from "./openalex";
export { searchResultToStudyInput } from "./to-study";
export { findDuplicates, type DedupResult } from "./dedup";
