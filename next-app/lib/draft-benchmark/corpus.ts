import path from "node:path";
import type { Study } from "@/types/ledger";
import type { DraftState } from "@/lib/draft-storage";
import {
  bulletList,
  citationNode,
  createDraftFixture,
  doc,
  equationBlock,
  figureBlock,
  heading,
  orderedList,
  paragraph,
  repeatedEvidenceParagraphs,
  tableBlock,
  textNode,
} from "@/lib/draft-benchmark/builders";

export type DraftBenchmarkStressArea =
  | "typing"
  | "citations"
  | "outline"
  | "objects"
  | "metadata"
  | "recovery"
  | "imports"
  | "export";

export type DraftBenchmarkManuscriptFixture = {
  id: string;
  label: string;
  description: string;
  scale: "short" | "medium" | "large";
  stressAreas: DraftBenchmarkStressArea[];
  snapshot: DraftState;
  studies: Study[];
  expected: {
    minimumSectionCount: number;
    minimumCitationCount: number;
    requiredNodeTypes: string[];
    exportFormats: Array<"docx" | "markdown">;
  };
};

export type DraftBenchmarkImportFixture = {
  id: string;
  label: string;
  format: "docx" | "markdown" | "html" | "csv" | "tsv" | "csl-json" | "ris" | "bibtex";
  sourcePath: string;
  description: string;
  expectedReport: {
    preserved: string[];
    downgraded: string[];
    unresolved: string[];
  };
};

function createStudies(count: number): Study[] {
  return Array.from({ length: count }, (_, index) => {
    const n = index + 1;
    return {
      id: `study-${n}`,
      title: `Benchmark Study ${n}`,
      authors: `Author ${n}, Collaborator ${n}`,
      year: 2015 + (index % 10),
      status: "active",
      quality: index % 3 === 0 ? "High" : index % 3 === 1 ? "Medium" : "Low",
      details: {
        journal: `Journal ${String.fromCharCode(65 + (index % 5))}`,
        doi: `10.1000/litrev-benchmark-${n}`,
        pmid: `20000${n}`,
        abstract: `Synthetic benchmark abstract ${n}.`,
      },
    };
  });
}

const benchmarkStudies = createStudies(12);
const benchmarkStudyMap = new Map(benchmarkStudies.map((study) => [study.id, study]));

function fixtureStudies(ids: string[]): Study[] {
  return ids
    .map((id) => benchmarkStudyMap.get(id))
    .filter((study): study is Study => Boolean(study));
}

const shortPaperStudies = fixtureStudies(["study-1", "study-2", "study-3"]);
const mediumReviewStudies = fixtureStudies(["study-1", "study-2", "study-3", "study-4", "study-5", "study-6"]);
const largeStudies = fixtureStudies(benchmarkStudies.map((study) => study.id));
const objectStudies = fixtureStudies(["study-2", "study-4", "study-6", "study-8"]);
const metadataStudies = fixtureStudies(["study-3", "study-5", "study-7"]);

function fixturePath(...segments: string[]) {
  return path.join("test", "fixtures", "draft", ...segments);
}

export const draftBenchmarkManuscriptFixtures: DraftBenchmarkManuscriptFixture[] = [
  {
    id: "short-paper",
    label: "Short Paper",
    description: "Baseline manuscript for cold-open, save, export, and outline checks.",
    scale: "short",
    stressAreas: ["typing", "citations", "outline", "export"],
    studies: shortPaperStudies,
    snapshot: createDraftFixture({
      sectionOrder: ["abstract", "introduction", "methods", "results", "discussion", "references"],
      mode: "section",
      activeSection: "abstract",
      sections: {
        abstract: {
          ledgerStudyIds: ["study-1"],
          content: doc(
            paragraph(
              textNode("This benchmark abstract summarizes the main endpoint and confidence interval. "),
              citationNode("study-1", "short-abs-1"),
            ),
          ),
        },
        introduction: {
          ledgerStudyIds: ["study-1", "study-2"],
          content: doc(
            heading(2, "Context"),
            paragraph(
              textNode("The introduction frames mechanism plausibility and prior efficacy findings. "),
              citationNode("study-2", "short-intro-1"),
            ),
          ),
        },
        methods: {
          ledgerStudyIds: ["study-2"],
          content: doc(
            heading(2, "Design"),
            bulletList([
              "Parallel-group randomized comparison.",
              "Primary endpoint assessed at week twelve.",
            ]),
          ),
        },
        results: {
          ledgerStudyIds: ["study-1", "study-3"],
          content: doc(
            heading(2, "Primary outcome"),
            paragraph(
              textNode("Treatment improved the primary endpoint without excess serious adverse events. "),
              citationNode("study-3", "short-results-1"),
            ),
          ),
        },
        discussion: {
          ledgerStudyIds: ["study-3"],
          content: doc(
            paragraph(textNode("The discussion highlights precision limits, adherence, and generalizability.")),
          ),
        },
        references: {
          content: doc(paragraph()),
        },
      },
    }),
    expected: {
      minimumSectionCount: 6,
      minimumCitationCount: 3,
      requiredNodeTypes: ["heading", "paragraph", "citation", "bulletList"],
      exportFormats: ["docx", "markdown"],
    },
  },
  {
    id: "medium-review",
    label: "Medium Review",
    description: "Multi-section review fixture for outline, command, citation-density, and export checks.",
    scale: "medium",
    stressAreas: ["typing", "citations", "outline", "recovery", "export"],
    studies: mediumReviewStudies,
    snapshot: createDraftFixture({
      sectionOrder: ["abstract", "background", "methods", "results", "discussion", "references"],
      customSections: {
        background: {
          label: "Background",
          placeholder: "Summarize field context and why the question matters.",
        },
      },
      mode: "full",
      activeSection: "background",
      sections: {
        abstract: {
          ledgerStudyIds: ["study-1", "study-2"],
          content: doc(
            paragraph(
              textNode("Across the included cohort, intervention effects favored earlier treatment intensification. "),
              citationNode("study-1", "medium-abs-1"),
              textNode(" "),
              citationNode("study-2", "medium-abs-2"),
            ),
          ),
        },
        background: {
          ledgerStudyIds: ["study-1", "study-3", "study-4"],
          content: doc(
            heading(2, "Prior evidence"),
            paragraph(
              textNode("Prior meta-analytic summaries suggested moderate benefit but high contextual heterogeneity. "),
              citationNode("study-3", "medium-bg-1"),
            ),
            paragraph(
              textNode("Mechanistic plausibility and care-path timing remain major explanatory candidates. "),
              citationNode("study-4", "medium-bg-2"),
            ),
          ),
        },
        methods: {
          ledgerStudyIds: ["study-2", "study-5"],
          content: doc(
            heading(2, "Review workflow"),
            orderedList([
              "Screen titles and abstracts against predefined eligibility criteria.",
              "Extract outcomes, comparators, and adverse-event reporting.",
              "Narratively synthesize effect direction and certainty signals.",
            ]),
          ),
        },
        results: {
          ledgerStudyIds: ["study-1", "study-2", "study-5", "study-6"],
          content: doc(
            heading(2, "Across-study synthesis"),
            ...repeatedEvidenceParagraphs({
              count: 6,
              prefix: "Result paragraph",
              studyIds: ["study-1", "study-2", "study-5", "study-6"],
              uidPrefix: "medium-results",
            }),
          ),
        },
        discussion: {
          ledgerStudyIds: ["study-4", "study-6"],
          content: doc(
            heading(2, "Interpretation"),
            paragraph(
              textNode("Residual confounding and inconsistent comparator intensity still limit confidence in pooled interpretation. "),
              citationNode("study-6", "medium-discussion-1"),
            ),
          ),
        },
        references: {
          content: doc(paragraph()),
        },
      },
    }),
    expected: {
      minimumSectionCount: 6,
      minimumCitationCount: 10,
      requiredNodeTypes: ["heading", "paragraph", "citation", "orderedList"],
      exportFormats: ["docx", "markdown"],
    },
  },
  {
    id: "large-evidence-heavy",
    label: "Large Evidence-Heavy Manuscript",
    description: "Long synthetic manuscript for typing, save, anchor, and export stress under dense citation load.",
    scale: "large",
    stressAreas: ["typing", "citations", "recovery", "outline", "export"],
    studies: largeStudies,
    snapshot: createDraftFixture({
      sectionOrder: ["abstract", "introduction", "methods", "results", "discussion", "limitations", "conclusion", "references"],
      customSections: {
        limitations: {
          label: "Limitations",
          placeholder: "Capture validity threats, missing evidence, and unresolved reviewer concerns.",
        },
      },
      mode: "full",
      activeSection: "results",
      sections: {
        abstract: {
          ledgerStudyIds: ["study-1", "study-2", "study-3"],
          content: doc(
            heading(2, "Summary"),
            ...repeatedEvidenceParagraphs({
              count: 3,
              prefix: "Abstract synthesis paragraph",
              studyIds: ["study-1", "study-2", "study-3"],
              uidPrefix: "large-abstract",
            }),
          ),
        },
        introduction: {
          ledgerStudyIds: ["study-1", "study-4", "study-7"],
          content: doc(
            heading(2, "Clinical rationale"),
            ...repeatedEvidenceParagraphs({
              count: 6,
              prefix: "Introduction paragraph",
              studyIds: ["study-1", "study-4", "study-7"],
              uidPrefix: "large-intro",
            }),
          ),
        },
        methods: {
          ledgerStudyIds: ["study-2", "study-5", "study-8"],
          content: doc(
            heading(2, "Eligibility and extraction"),
            ...repeatedEvidenceParagraphs({
              count: 6,
              prefix: "Methods paragraph",
              studyIds: ["study-2", "study-5", "study-8"],
              uidPrefix: "large-methods",
            }),
          ),
        },
        results: {
          ledgerStudyIds: benchmarkStudies.map((study) => study.id),
          content: doc(
            heading(2, "Outcome synthesis"),
            ...repeatedEvidenceParagraphs({
              count: 12,
              prefix: "Results paragraph",
              studyIds: benchmarkStudies.map((study) => study.id),
              uidPrefix: "large-results",
            }),
          ),
        },
        discussion: {
          ledgerStudyIds: ["study-3", "study-6", "study-9", "study-12"],
          content: doc(
            heading(2, "Interpretive synthesis"),
            ...repeatedEvidenceParagraphs({
              count: 5,
              prefix: "Discussion paragraph",
              studyIds: ["study-3", "study-6", "study-9", "study-12"],
              uidPrefix: "large-discussion",
            }),
          ),
        },
        limitations: {
          ledgerStudyIds: ["study-10", "study-11"],
          content: doc(
            heading(2, "Bias and missingness"),
            ...repeatedEvidenceParagraphs({
              count: 3,
              prefix: "Limitation paragraph",
              studyIds: ["study-10", "study-11"],
              uidPrefix: "large-limitations",
            }),
          ),
        },
        conclusion: {
          ledgerStudyIds: ["study-12"],
          content: doc(
            paragraph(
              textNode("The conclusion consolidates directionality, implementation relevance, and where confirmatory trials remain necessary. "),
              citationNode("study-12", "large-conclusion-1"),
            ),
          ),
        },
        references: {
          content: doc(paragraph()),
        },
      },
    }),
    expected: {
      minimumSectionCount: 8,
      minimumCitationCount: 35,
      requiredNodeTypes: ["heading", "paragraph", "citation"],
      exportFormats: ["docx", "markdown"],
    },
  },
  {
    id: "object-heavy",
    label: "Object-Heavy Manuscript",
    description: "Fixture for figures, tables, equations, captions, and cross-reference-ready blocks.",
    scale: "medium",
    stressAreas: ["objects", "citations", "outline", "export"],
    studies: objectStudies,
    snapshot: createDraftFixture({
      sectionOrder: ["abstract", "methods", "results", "discussion", "references"],
      mode: "full",
      activeSection: "results",
      sections: {
        abstract: {
          ledgerStudyIds: ["study-2"],
          content: doc(
            paragraph(
              textNode("This fixture forces the manuscript system to preserve scientific objects and captions. "),
              citationNode("study-2", "object-abs-1"),
            ),
          ),
        },
        methods: {
          ledgerStudyIds: ["study-4"],
          content: doc(
            heading(2, "Model and data"),
            equationBlock("eq-1", "E = mc^2", "Equation 1. Synthetic calibration equation."),
            paragraph(
              textNode("The methods section references the synthetic calibration and capture workflow. "),
              citationNode("study-4", "object-methods-1"),
            ),
          ),
        },
        results: {
          ledgerStudyIds: ["study-2", "study-6", "study-8"],
          content: doc(
            heading(2, "Primary objects"),
            figureBlock("fig-1", "Figure 1. Forest-style comparison of synthetic treatment effects.", "Forest comparison"),
            tableBlock("tbl-1", "Table 1. Summary metrics used for object-heavy export coverage.", [
              ["Metric", "Arm A", "Arm B"],
              ["Response rate", "64%", "51%"],
              ["Serious adverse events", "3", "5"],
            ]),
            paragraph(
              textNode("The figure and table jointly summarize effect direction and variance. "),
              citationNode("study-6", "object-results-1"),
            ),
          ),
        },
        discussion: {
          ledgerStudyIds: ["study-8"],
          content: doc(
            paragraph(
              textNode("Object rendering must stay truthful even when the export pipeline flattens unsupported nodes to readable content. "),
              citationNode("study-8", "object-discussion-1"),
            ),
          ),
        },
        references: {
          content: doc(paragraph()),
        },
      },
    }),
    expected: {
      minimumSectionCount: 5,
      minimumCitationCount: 4,
      requiredNodeTypes: ["figure", "table", "equation", "citation"],
      exportFormats: ["docx", "markdown"],
    },
  },
  {
    id: "metadata-heavy",
    label: "Metadata-Heavy Manuscript",
    description: "Fixture for title-page, abstract, authorship, disclosure, and availability-oriented sections.",
    scale: "medium",
    stressAreas: ["metadata", "outline", "citations", "export"],
    studies: metadataStudies,
    snapshot: createDraftFixture({
      sectionOrder: [
        "title-page",
        "structured-abstract",
        "introduction",
        "methods",
        "results",
        "discussion",
        "author-contributions",
        "data-availability",
        "references",
      ],
      customSections: {
        "title-page": {
          label: "Title Page",
          placeholder: "Capture title, running title, authors, affiliations, and contact details.",
        },
        "structured-abstract": {
          label: "Structured Abstract",
          placeholder: "Background, methods, results, and conclusions.",
        },
        "author-contributions": {
          label: "Author Contributions",
          placeholder: "Record contributor roles and acknowledgements.",
        },
        "data-availability": {
          label: "Data Availability",
          placeholder: "Document data, code, ethics, and funding statements.",
        },
      },
      mode: "section",
      activeSection: "title-page",
      sections: {
        "title-page": {
          content: doc(
            heading(2, "Cardiometabolic Outcomes After Timed Intensification"),
            paragraph(textNode("Running title: Timed Intensification Outcomes")),
            paragraph(textNode("Authors: A. Example; B. Example; C. Example")),
            paragraph(textNode("Affiliations: Department of Benchmark Medicine; Synthetic Trials Unit")),
          ),
        },
        "structured-abstract": {
          ledgerStudyIds: ["study-3", "study-5"],
          content: doc(
            heading(3, "Background"),
            paragraph(textNode("Structured abstract background sentence.")),
            heading(3, "Methods"),
            paragraph(textNode("Structured abstract methods sentence.")),
            heading(3, "Results"),
            paragraph(
              textNode("Structured abstract results sentence with benchmark evidence. "),
              citationNode("study-3", "metadata-abs-1"),
            ),
            heading(3, "Conclusions"),
            paragraph(textNode("Structured abstract conclusion sentence.")),
          ),
        },
        introduction: {
          ledgerStudyIds: ["study-3"],
          content: doc(
            paragraph(
              textNode("The introduction establishes why publication metadata and disclosure completeness must remain first-class. "),
              citationNode("study-3", "metadata-intro-1"),
            ),
          ),
        },
        methods: {
          ledgerStudyIds: ["study-5"],
          content: doc(
            paragraph(
              textNode("The methods section captures screening, extraction, and certainty adjudication. "),
              citationNode("study-5", "metadata-methods-1"),
            ),
          ),
        },
        results: {
          content: doc(paragraph(textNode("Primary results narrative placeholder for metadata-heavy fixture."))),
        },
        discussion: {
          content: doc(paragraph(textNode("Discussion placeholder focused on reporting completeness and reuse."))),
        },
        "author-contributions": {
          content: doc(
            bulletList([
              "Conceptualization: A. Example",
              "Data curation: B. Example",
              "Writing - original draft: A. Example",
              "Writing - review and editing: all authors",
            ]),
          ),
        },
        "data-availability": {
          content: doc(
            paragraph(textNode("Funding: Benchmark Foundation Grant 2026-01.")),
            paragraph(textNode("Conflicts of interest: none declared.")),
            paragraph(textNode("Data availability: synthetic benchmark data available on request.")),
            paragraph(textNode("Code availability: internal prototype repository.")),
          ),
        },
        references: {
          content: doc(paragraph()),
        },
      },
    }),
    expected: {
      minimumSectionCount: 9,
      minimumCitationCount: 3,
      requiredNodeTypes: ["heading", "paragraph", "citation", "bulletList"],
      exportFormats: ["docx", "markdown"],
    },
  },
];

export const draftBenchmarkImportFixtures: DraftBenchmarkImportFixture[] = [
  {
    id: "docx-structured-sample",
    label: "DOCX Structured Sample",
    format: "docx",
    sourcePath: fixturePath("imports", "source", "sample-manuscript.docx"),
    description: "Synthetic DOCX source with headings, lists, and table-like content for intake validation.",
    expectedReport: {
      preserved: ["headings", "paragraphs", "lists"],
      downgraded: ["table styling"],
      unresolved: ["embedded citation field codes"],
    },
  },
  {
    id: "markdown-manuscript",
    label: "Markdown Manuscript",
    format: "markdown",
    sourcePath: fixturePath("imports", "source", "sample-manuscript.md"),
    description: "Markdown-family manuscript with headings, citations, and a table.",
    expectedReport: {
      preserved: ["headings", "paragraphs", "lists", "table structure"],
      downgraded: ["citation syntax to unresolved external references"],
      unresolved: ["pandoc-style cite keys"],
    },
  },
  {
    id: "word-paste-html",
    label: "Word/Docs Paste HTML",
    format: "html",
    sourcePath: fixturePath("imports", "source", "sample-word-paste.html"),
    description: "Clipboard-like HTML from word processor paste flows.",
    expectedReport: {
      preserved: ["paragraphs", "headings", "lists"],
      downgraded: ["inline styles"],
      unresolved: [],
    },
  },
  {
    id: "table-html",
    label: "HTML Table Paste",
    format: "html",
    sourcePath: fixturePath("imports", "source", "sample-table.html"),
    description: "Raw HTML table sample for import coverage.",
    expectedReport: {
      preserved: ["table rows", "table columns"],
      downgraded: ["table border styling"],
      unresolved: [],
    },
  },
  {
    id: "table-csv",
    label: "CSV Table Source",
    format: "csv",
    sourcePath: fixturePath("imports", "source", "sample-table.csv"),
    description: "Comma-separated tabular source for table import coverage.",
    expectedReport: {
      preserved: ["rows", "columns"],
      downgraded: [],
      unresolved: [],
    },
  },
  {
    id: "table-tsv",
    label: "TSV Table Source",
    format: "tsv",
    sourcePath: fixturePath("imports", "source", "sample-table.tsv"),
    description: "Tab-separated tabular source for table import coverage.",
    expectedReport: {
      preserved: ["rows", "columns"],
      downgraded: [],
      unresolved: [],
    },
  },
  {
    id: "references-csl-json",
    label: "CSL JSON Bibliography",
    format: "csl-json",
    sourcePath: fixturePath("imports", "source", "sample-references.csl.json"),
    description: "Bibliography import sample in CSL JSON.",
    expectedReport: {
      preserved: ["title", "author", "issued date", "DOI"],
      downgraded: [],
      unresolved: [],
    },
  },
  {
    id: "references-ris",
    label: "RIS Bibliography",
    format: "ris",
    sourcePath: fixturePath("imports", "source", "sample-references.ris"),
    description: "Bibliography import sample in RIS.",
    expectedReport: {
      preserved: ["title", "author", "year", "journal"],
      downgraded: [],
      unresolved: [],
    },
  },
  {
    id: "references-bibtex",
    label: "BibTeX Bibliography",
    format: "bibtex",
    sourcePath: fixturePath("imports", "source", "sample-references.bib"),
    description: "Bibliography import sample in BibTeX.",
    expectedReport: {
      preserved: ["title", "author", "year", "journal"],
      downgraded: [],
      unresolved: [],
    },
  },
];
