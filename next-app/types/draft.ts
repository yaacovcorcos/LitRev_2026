export const DRAFT_SECTIONS = [
  {
    key: "abstract",
    label: "Abstract",
    placeholder: "Summarize the objective, methods, key results, and conclusion.",
  },
  {
    key: "introduction",
    label: "Introduction",
    placeholder: "Provide background, rationale, and your research question.",
  },
  {
    key: "methods",
    label: "Methods",
    placeholder: "Describe design, data sources, inclusion/exclusion, and analysis.",
  },
  {
    key: "results",
    label: "Results",
    placeholder: "Report the findings clearly (tables/figures can come later).",
  },
  {
    key: "discussion",
    label: "Discussion",
    placeholder: "Interpret results, compare to prior work, note limitations and implications.",
  },
  {
    key: "conclusion",
    label: "Conclusion",
    placeholder: "Summarize the takeaways and next steps.",
  },
  {
    key: "references",
    label: "References",
    placeholder: "Add your references for this manuscript.",
  },
  {
    key: "funding",
    label: "Funding",
    placeholder: "List funding sources and grant information.",
  },
  {
    key: "conflicts",
    label: "Conflicts",
    placeholder: "Declare conflicts of interest and disclosures.",
  },
  {
    key: "supplement",
    label: "Supplement",
    placeholder: "Supplementary material / appendix content.",
  },
] as const;

export type DraftSectionKey = (typeof DRAFT_SECTIONS)[number]["key"];
export type DraftSection = (typeof DRAFT_SECTIONS)[number];
export type DraftSectionId = string;

export type DraftMode = "section" | "full";

export const DEFAULT_SECTION_ORDER: DraftSectionKey[] = [
  "abstract",
  "introduction",
  "methods",
  "results",
  "discussion",
  "conclusion",
  "references",
];

export const OPTIONAL_SECTION_KEYS: DraftSectionKey[] = [
  "funding",
  "conflicts",
  "supplement",
];
