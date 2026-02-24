import "server-only";

import type { DraftState } from "@/lib/draftStorage";
import { createDefaultDraftState } from "@/lib/draftStorage";
import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import { prisma } from "@/lib/server/prisma";
import { getProject } from "@/lib/server/projects";
import { requireScope, type ServiceScope, type ScopeInput } from "@/lib/server/scope";
import { DEMO_PROJECT_DESCRIPTION, DEMO_PROJECT_ID, DEMO_PROJECT_NAME, DEMO_PROJECT_PAPERS, DEMO_PROJECT_STATUS_TEXT } from "@/lib/demo/constants";
import type { Project } from "@/types/project";
import type { ProtocolData } from "@/types/protocol";
import type { Study, StudyDetails } from "@/types/ledger";
import type { JSONContent } from "@tiptap/core";
import { Prisma } from "@prisma/client";

/** Type-safe cast for app types → Prisma Json fields. */
function toJsonValue<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

type DemoStudySeed = {
  id: string;
  title: string;
  authors: string;
  year: number;
  status: Study["status"];
  quality: Study["quality"];
  details: StudyDetails;
};

const DEMO_CONVERSATION_ID = "demo-yoga-anxiety-welcome";

const DEMO_PROTOCOL: ProtocolData = {
  researchQuestion:
    "Does yoga reduce anxiety symptoms in adults compared to no treatment, waitlist, or active interventions?",
  pico: {
    population: "Adults (18+) with anxiety disorders or elevated anxiety symptoms",
    intervention: "Structured yoga interventions (e.g., Kundalini, Iyengar, Sudarshan Kriya)",
    comparison: "Waitlist/no treatment and active comparators (e.g., CBT, relaxation)",
    outcome: "Primary: anxiety symptom severity on validated scales; secondary: depression and quality-of-life outcomes",
  },
  eligibility: {
    inclusion: [
      "Randomized controlled trial design",
      "Adult population (18 years or older)",
      "Yoga is a primary intervention arm",
      "Reports validated anxiety outcomes",
    ],
    exclusion: [
      "Non-randomized or uncontrolled designs",
      "Pediatric/adolescent-only populations",
      "No anxiety-specific validated outcome measure",
    ],
  },
  searchStrategy: {
    query:
      '(yoga OR "mind-body") AND (anxiety OR "anxiety disorders") AND (randomized OR randomised OR trial)',
    databases: ["PubMed", "PsycINFO", "CENTRAL", "Scopus"],
  },
  methodology: {
    studyDesigns: ["Randomized Controlled Trials (RCTs)"],
    timeFrameStart: "1970",
    timeFrameEnd: "2018",
    qualityAssessmentTool: "Cochrane Risk of Bias",
    qualityAssessmentNotes:
      "Assess randomization, allocation concealment, blinding, attrition, and selective reporting. Record rationale for each domain.",
  },
};

const DEMO_STUDIES: DemoStudySeed[] = [
  {
    id: "demo-study-broota-1994",
    title: "Impact of relaxation training on examination anxiety among adolescent students",
    authors: "Broota A, Sanghvi V",
    year: 1994,
    status: "extracted",
    quality: "Low",
    details: {
      journal: "Psychological Studies",
      studyType: "RCT",
      source: "manual",
      sampleSize: 20,
      triageDecision: "keep",
      triageNote: "Randomized trial with validated state and trait anxiety outcomes in adults.",
      aiSummary:
        "Small RCT showing reduced state and trait anxiety after 6 weeks of integrated yoga training versus control.",
    },
  },
  {
    id: "demo-study-davis-2015",
    title: "Restorative yoga for women with breast cancer: findings from a randomized pilot study",
    authors: "Davis L, Yeh G, Wayne P",
    year: 2015,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.1016/j.ctcp.2015.06.005",
      pmid: "26256135",
      journal: "Complementary Therapies in Clinical Practice",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/26256135/",
      source: "manual",
      sampleSize: 44,
      triageDecision: "keep",
      triageNote: "Randomized design and validated anxiety outcome make this eligible.",
      aiSummary:
        "Pilot trial showed moderate improvements in anxiety for restorative yoga versus waitlist among women post breast-cancer treatment.",
    },
  },
  {
    id: "demo-study-demanincor-2016",
    title:
      "Breathe easier: yoga as a complementary therapy for depression and anxiety symptoms in alcohol dependence treatment",
    authors: "de Manincor M, Bensoussan A, Smith C, Fahey P, Bourchier S",
    year: 2016,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.1002/da.22502",
      pmid: "27030303",
      journal: "Depression and Anxiety",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/27030303/",
      source: "manual",
      sampleSize: 38,
      triageDecision: "keep",
      triageNote: "Eligible RCT despite comorbid population; anxiety outcomes are reported.",
      aiSummary:
        "Adjunctive yoga improved anxiety trajectories in long-term residential treatment participants compared with treatment-as-usual alone.",
    },
  },
  {
    id: "demo-study-gupta-2013",
    title: "Effect of yoga based lifestyle intervention on state and trait anxiety",
    authors: "Gupta N, Khera S, Vempati RP, Sharma R, Bijlani RL",
    year: 2013,
    status: "extracted",
    quality: "Medium",
    details: {
      journal: "Indian Journal of Physiology and Pharmacology",
      studyType: "RCT",
      sourceUrl: "https://ijrap.net/admin/php/uploads/1128_pdf.pdf",
      source: "manual",
      sampleSize: 24,
      triageDecision: "keep",
      triageNote: "Randomized assignment and clear anxiety outcomes fit protocol criteria.",
      aiSummary:
        "Yoga lifestyle intervention produced statistically significant reductions in anxiety scores compared with controls.",
    },
  },
  {
    id: "demo-study-norton-1983",
    title: "A comparison of two relaxation procedures for reducing cognitive and somatic anxiety",
    authors: "Norton GR, Johnson LR",
    year: 1983,
    status: "extracted",
    quality: "Low",
    details: {
      doi: "10.1016/0005-7916(83)90050-2",
      journal: "Behaviour Research and Therapy",
      studyType: "RCT",
      sourceUrl: "https://doi.org/10.1016/0005-7916(83)90050-2",
      source: "manual",
      sampleSize: 25,
      triageDecision: "keep",
      triageNote: "Randomized controlled relaxation/yoga comparison in anxiety-prone participants.",
      aiSummary:
        "Older trial suggests both relaxation and yoga-like breathing can reduce anxiety, with modest between-group differences.",
    },
  },
  {
    id: "demo-study-parthasarathy-2014",
    title: "Effect of integrated yoga module on positive and negative emotions in home guards in Bengaluru",
    authors: "Parthasarathy S, Vasudeva S, Raghuram N",
    year: 2014,
    status: "extracted",
    quality: "Medium",
    details: {
      doi: "10.7727/wimj.2012.054",
      pmid: "25303199",
      journal: "West Indian Medical Journal",
      studyType: "RCT",
      sourceUrl:
        "https://www.mona.uwi.edu/fms/wimj/system/files/article_pdfs/parthasarathy_et_al-integrated_yoga_module_in_dealing_with_anxiety.pdf",
      source: "manual",
      sampleSize: 75,
      triageDecision: "keep",
      triageNote: "Strong fit: randomized design, adult participants, and anxiety emotion scale outcomes.",
      aiSummary:
        "Integrated yoga module improved positive affect and reduced anxiety-related negative affect compared with controls over 8 weeks.",
    },
  },
  {
    id: "demo-study-sahasi-1991",
    title: "Effectiveness of yogic techniques in treating anxiety",
    authors: "Sahasi G, Mohan D, Kacker C",
    year: 1991,
    status: "extracted",
    quality: "Low",
    details: {
      journal: "Indian Journal of Psychiatry",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/21776114/",
      source: "manual",
      sampleSize: 32,
      triageDecision: "keep",
      triageNote: "Trial meets inclusion rules despite limited reporting quality.",
      aiSummary:
        "Trial suggests yoga techniques can reduce anxiety symptoms, but reporting limitations increase risk-of-bias concerns.",
    },
  },
  {
    id: "demo-study-vahia-1973",
    title: "Psychophysiologic therapy based on the concepts of Patanjali",
    authors: "Vahia NS, Doongaji DR, Jeste DV, et al.",
    year: 1973,
    status: "extracted",
    quality: "Low",
    details: {
      doi: "10.1176/appi.psychotherapy.1973.27.4.557",
      pmid: "4761011",
      journal: "American Journal of Psychotherapy",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/4761011/",
      source: "manual",
      sampleSize: 18,
      triageDecision: "keep",
      triageNote: "Early randomized psychophysiological yoga protocol with measurable anxiety outcomes.",
      aiSummary:
        "Legacy trial reports anxiety reduction with yoga-based psychophysiologic therapy, but methodology details are sparse.",
    },
  },
  {
    id: "demo-study-kozasa-2008",
    title: "Evaluation of Siddha Samadhi yoga for anxiety and depression symptoms: a preliminary study",
    authors: "Kozasa EH, Santos RF, Rueda AD, et al.",
    year: 2008,
    status: "pending",
    quality: "Low",
    details: {
      doi: "10.2466/PR0.103.1.271-274",
      journal: "Psychological Reports",
      studyType: "Other",
      sourceUrl: "https://doi.org/10.2466/PR0.103.1.271-274",
      source: "manual",
      triageDecision: "exclude",
      exclusionReason: "Study design does not meet inclusion criteria (not a randomized controlled trial).",
      triageNote: "Preliminary non-randomized design; excluded by protocol criterion #1.",
      aiSummary:
        "Preliminary observational yoga study with anxiety outcomes, but excluded because randomization was not used.",
    },
  },
  {
    id: "demo-study-hagins-2013",
    title:
      "Effectiveness of an 8-week yoga intervention for sixth graders with elevated anxiety and depression symptoms",
    authors: "Hagins M, Rundle A, Consedine NS, Khalsa SBS",
    year: 2013,
    status: "pending",
    quality: "Medium",
    details: {
      doi: "10.1007/s12671-012-0153-6",
      pmid: "23275644",
      pmcid: "PMC3572691",
      journal: "Mindfulness",
      studyType: "RCT",
      sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3572691/",
      source: "manual",
      triageDecision: "exclude",
      exclusionReason: "Pediatric population outside protocol age criterion (18+ adults only).",
      triageNote: "Well-designed RCT, but participants are school-age children.",
      aiSummary:
        "Children-focused RCT with anxiety benefits; excluded because the demo protocol is limited to adult populations.",
    },
  },
  {
    id: "demo-study-bower-2014",
    title: "Yoga reduces inflammatory signaling in fatigued breast cancer survivors: a randomized controlled trial",
    authors: "Bower JE, Crosswell AD, Stanton AL, et al.",
    year: 2014,
    status: "pending",
    quality: "High",
    details: {
      doi: "10.1016/j.psyneuen.2014.01.019",
      pmid: "24703167",
      pmcid: "PMC4060606",
      journal: "Psychoneuroendocrinology",
      studyType: "RCT",
      sourceUrl: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4060606/",
      source: "manual",
      triageDecision: "exclude",
      exclusionReason: "No validated anxiety-specific primary outcome was reported.",
      triageNote: "RCT quality is good, but outcomes focus on fatigue and inflammation rather than anxiety scales.",
      aiSummary:
        "High-quality yoga trial in cancer survivors, excluded from this review because anxiety is not a defined primary endpoint.",
    },
  },
  {
    id: "demo-study-hallgren-2014",
    title: "Treatment effects of yoga on depression and anxiety in alcohol dependence: a randomized trial",
    authors: "Hallgren M, Romberg K, Bakshi AS, et al.",
    year: 2014,
    status: "pending",
    quality: "Medium",
    details: {
      doi: "10.1016/j.ctim.2014.03.003",
      pmid: "24906547",
      journal: "Complementary Therapies in Medicine",
      studyType: "RCT",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/24906547/",
      source: "manual",
      triageDecision: "maybe",
      triageNote:
        "Borderline: yoga is adjunctive to alcohol dependence treatment. Team review needed on whether yoga is the primary intervention of interest.",
      aiSummary:
        "Randomized trial reports anxiety outcomes, but intervention is mixed with broader addiction treatment and may not fit primary-intervention criterion.",
    },
  },
];

const DEMO_FILE_ASSETS = [
  {
    id: "demo-file-gupta-2013-pdf",
    studyId: "demo-study-gupta-2013",
    filename: "gupta-2013-yoga-anxiety.pdf",
    publicUrl: "https://ijrap.net/admin/php/uploads/1128_pdf.pdf",
  },
  {
    id: "demo-file-parthasarathy-2014-pdf",
    studyId: "demo-study-parthasarathy-2014",
    filename: "parthasarathy-2014-integrated-yoga.pdf",
    publicUrl:
      "https://www.mona.uwi.edu/fms/wimj/system/files/article_pdfs/parthasarathy_et_al-integrated_yoga_module_in_dealing_with_anxiety.pdf",
  },
] as const;

const DEMO_NOTES = [
  {
    id: "demo-note-methodological-scope",
    title: "Methodological note",
    source: "manual" as const,
    tags: ["scope", "population"],
    content: docFromParagraphs([
      "We include both diagnosed anxiety disorders and elevated subclinical anxiety symptoms to capture a broader evidence base.",
      "This decision should be acknowledged in the Discussion as a source of clinical heterogeneity.",
    ]),
  },
  {
    id: "demo-note-comparison-effects",
    title: "Comparison-group effect pattern",
    source: "conversation" as const,
    tags: ["results", "effect-size"],
    content: docFromParagraphs([
      "Effect sizes are generally larger for yoga versus waitlist/no treatment than for yoga versus active comparators (e.g., CBT, relaxation).",
      "This pattern should be emphasized in Results and interpreted carefully in Discussion.",
    ]),
  },
  {
    id: "demo-note-small-samples",
    title: "Limitation to address",
    source: "manual" as const,
    tags: ["limitations", "bias"],
    content: docFromParagraphs([
      "Most included trials are small and underpowered, which raises uncertainty around pooled estimates and subgroup effects.",
      "Include this limitation in both Abstract and Discussion.",
    ]),
  },
];

const DEMO_PROJECT_MEMORIES = [
  {
    id: "demo-memory-include-subclinical",
    type: "decision",
    category: "population",
    statement: "Include subclinical anxiety populations alongside diagnosed anxiety disorders.",
    rationale: "Broadens evidence capture while preserving anxiety-focused outcomes.",
    importance: "important",
    tags: ["demo", "population", "scope"],
  },
  {
    id: "demo-memory-yoga-definition",
    type: "definition",
    category: "intervention",
    statement: "Yoga intervention means a structured program where asana or breathwork is a core component.",
    rationale: "Keeps intervention boundary explicit during screening and extraction.",
    importance: "critical",
    tags: ["demo", "intervention"],
  },
  {
    id: "demo-memory-duration-threshold",
    type: "criterion",
    category: "inclusion",
    statement: "Prefer interventions with at least 4 weeks of structured practice.",
    rationale: "Short single-session interventions are less likely to show durable anxiety change.",
    importance: "normal",
    tags: ["demo", "duration"],
  },
  {
    id: "demo-memory-moderator-goal",
    type: "goal",
    category: "outcome",
    statement: "Assess whether yoga style moderates observed anxiety effect sizes.",
    rationale: "Helps explain heterogeneity across included studies.",
    importance: "important",
    tags: ["demo", "heterogeneity"],
  },
] as const;

function docFromParagraphs(paragraphs: string[]): JSONContent {
  return {
    type: "doc",
    content: paragraphs.map((paragraph) => ({
      type: "paragraph",
      content: [{ type: "text", text: paragraph }],
    })),
  };
}

function introDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Anxiety disorders remain highly prevalent, and patients often seek non-pharmacologic adjuncts to standard care.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Across randomized evidence, yoga has shown stronger effects against waitlist controls in several trials " },
          { type: "citation", attrs: { id: "demo-study-davis-2015", label: "Davis et al., 2015" } },
          { type: "text", text: " and " },
          { type: "citation", attrs: { id: "demo-study-parthasarathy-2014", label: "Parthasarathy et al., 2014" } },
          { type: "text", text: ", while comparisons with active treatments appear more mixed." },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "This sample review maps protocol criteria directly to screening outcomes and manuscript claims so every conclusion is auditable." },
        ],
      },
    ],
  };
}

function methodsDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "We searched PubMed, PsycINFO, CENTRAL, and Scopus for randomized controlled trials of yoga interventions reporting validated anxiety outcomes in adult populations.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              'Search terms combined anxiety concepts with yoga terms and randomization filters (e.g., "(yoga OR mind-body) AND (anxiety) AND (randomized OR trial)").',
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Representative included trials span both waitlist and active-comparator designs, including " },
          { type: "citation", attrs: { id: "demo-study-davis-2015", label: "Davis et al., 2015" } },
          { type: "text", text: " and " },
          { type: "citation", attrs: { id: "demo-study-gupta-2013", label: "Gupta et al., 2013" } },
          { type: "text", text: "." },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Risk-of-bias appraisal follows the Cochrane framework; detailed domain-level judgments are intentionally left unfinished in this sample so you can continue from here.",
          },
        ],
      },
    ],
  };
}

function abstractDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Background: Yoga is increasingly used as an adjunctive intervention for anxiety, but effect consistency across comparator types remains unclear.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Methods: We synthesized randomized controlled evidence comparing yoga to waitlist/no treatment or active interventions in adults with anxiety symptoms.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Results: Included evidence suggests moderate benefits versus passive controls in trials such as " },
          { type: "citation", attrs: { id: "demo-study-davis-2015", label: "Davis et al., 2015" } },
          { type: "text", text: " and " },
          { type: "citation", attrs: { id: "demo-study-parthasarathy-2014", label: "Parthasarathy et al., 2014" } },
          { type: "text", text: ", with smaller or mixed differences versus active comparators." },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text:
              "Conclusion: Yoga appears promising for anxiety symptom reduction, though study heterogeneity and small samples limit certainty.",
          },
        ],
      },
    ],
  };
}

function buildDemoDraftState(): DraftState {
  const state = createDefaultDraftState();
  state.mode = "section";
  state.activeSection = "methods";

  state.contentBySection.abstract = abstractDoc();
  state.contentBySection.introduction = introDoc();
  state.contentBySection.methods = methodsDoc();

  state.ledgerBySection.abstract = ["demo-study-davis-2015", "demo-study-parthasarathy-2014"];
  state.ledgerBySection.introduction = ["demo-study-davis-2015", "demo-study-parthasarathy-2014", "demo-study-demanincor-2016"];
  state.ledgerBySection.methods = ["demo-study-davis-2015", "demo-study-gupta-2013"];

  return state;
}

const DEMO_DRAFT_STATE = buildDemoDraftState();

function demoWelcomeMessage(): string {
  return [
    "This is a sample review based on real data from Cramer et al. (2018) on yoga for anxiety.",
    "",
    "Everything here is editable: protocol, ledger, notes, memory, and draft sections.",
    "",
    "Try asking:",
    "- Which included study had the largest sample size?",
    "- Why was Kozasa et al. (2008) excluded?",
    "- Draft a Results section based on our included studies.",
  ].join("\n");
}

async function deleteDemoProjectSideData(tx: Prisma.TransactionClient): Promise<void> {
  // AIConversation, AgentRun, MemoryRetrieval, MemoryEmbedding, AutonomyConfig
  // are now FK-cascaded from Project — no manual cleanup needed.
  // AIUsage uses SET NULL (preserves analytics), so delete explicitly for clean demo reset.
  await tx.aIUsage.deleteMany({ where: { projectId: DEMO_PROJECT_ID } });
}

async function seedDemoProject(scope: ServiceScope, reset: boolean): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const existingProject = await tx.project.findFirst({
      where: {
        id: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        ownerId: scope.ownerId,
      },
      select: { id: true },
    });

    if (!reset && existingProject) {
      return;
    }

    await deleteDemoProjectSideData(tx);

    if (existingProject) {
      await tx.project.delete({ where: { id: DEMO_PROJECT_ID } });
    }

    await tx.project.create({
      data: {
        id: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        ownerId: scope.ownerId,
        name: DEMO_PROJECT_NAME,
        description: DEMO_PROJECT_DESCRIPTION,
        status: "ready",
        statusText: DEMO_PROJECT_STATUS_TEXT,
        papers: DEMO_PROJECT_PAPERS,
      },
    });

    await tx.protocol.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        data: toJsonValue(DEMO_PROTOCOL),
      },
    });

    await tx.draft.create({
      data: {
        projectId: DEMO_PROJECT_ID,
        state: toJsonValue(DEMO_DRAFT_STATE),
      },
    });

    await tx.study.createMany({
      data: DEMO_STUDIES.map((study) => ({
        id: study.id,
        projectId: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        title: study.title,
        authors: study.authors,
        year: study.year,
        status: study.status,
        quality: study.quality,
        details: toJsonValue(study.details),
      })),
    });

    await tx.fileAsset.createMany({
      data: DEMO_FILE_ASSETS.map((asset) => ({
        id: asset.id,
        projectId: DEMO_PROJECT_ID,
        workspaceId: scope.workspaceId,
        studyId: asset.studyId,
        kind: "source",
        format: "pdf",
        filename: asset.filename,
        mimeType: "application/pdf",
        size: 250_000,
        storagePath: `external/demo/${asset.filename}`,
        publicUrl: asset.publicUrl,
      })),
    });

    await tx.note.createMany({
      data: DEMO_NOTES.map((note) => ({
        id: note.id,
        projectId: DEMO_PROJECT_ID,
        title: note.title,
        content: toJsonValue(note.content),
        tags: note.tags,
        source: note.source,
      })),
    });

    await tx.projectMemory.createMany({
      data: DEMO_PROJECT_MEMORIES.map((memory) => ({
        id: memory.id,
        projectId: DEMO_PROJECT_ID,
        type: memory.type,
        category: memory.category,
        statement: memory.statement,
        rationale: memory.rationale,
        importance: memory.importance,
        tags: [...memory.tags],
      })),
    });

    await tx.aIConversation.create({
      data: {
        id: DEMO_CONVERSATION_ID,
        userId: scope.ownerId,
        workspaceId: scope.workspaceId,
        title: "Sample walkthrough",
        context: "project",
        page: "overview",
        projectId: DEMO_PROJECT_ID,
      },
    });

    await tx.aIMessage.create({
      data: {
        conversationId: DEMO_CONVERSATION_ID,
        role: "assistant",
        content: demoWelcomeMessage(),
      },
    });
  });
}

export async function openOrCreateDemoProject(
  scopeInput: ScopeInput
): Promise<Project> {
  const scoped = await ensureSingleUserSeed(scopeInput);
  const scope = requireScope(scoped);
  await seedDemoProject(scope, false);
  const project = await getProject(scope, DEMO_PROJECT_ID);
  if (!project) {
    throw new Error("Failed to open sample project.");
  }
  return project;
}

export async function resetDemoProject(
  scopeInput: ScopeInput,
  projectId: string
): Promise<Project> {
  if (projectId.trim() !== DEMO_PROJECT_ID) {
    throw new Error("Only the sample project can be reset via this action.");
  }
  const scoped = await ensureSingleUserSeed(scopeInput);
  const scope = requireScope(scoped);
  await seedDemoProject(scope, true);
  const project = await getProject(scope, DEMO_PROJECT_ID);
  if (!project) {
    throw new Error("Failed to reset sample project.");
  }
  return project;
}
