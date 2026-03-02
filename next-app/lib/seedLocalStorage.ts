import { loadProjects, saveProjects } from "@/lib/storage";
import { saveLedger } from "@/lib/ledgerStorage";
import { createDefaultDraftState, saveDraftState, type DraftState } from "@/lib/draftStorage";
import { hasProtocolData, saveProtocolData } from "@/lib/protocolStorage";
import {
  createDefaultProjectCopilotState,
  saveProjectCopilotState,
  type CopilotMessage,
  type ProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import type { Project } from "@/types/project";
import type { ProtocolData } from "@/types/protocol";
import type { Study } from "@/types/ledger";
import type { JSONContent } from "@tiptap/core";

const PROJECTS_KEY = "litrev_projects_v1";
const LEDGER_PREFIX = "litrev_ledger_";
const DRAFT_PREFIX = "litrev_draft_v1";
const COPILOT_PREFIX = "litrev_project_copilot_v1";

const seedProjects: Project[] = [
  {
    id: "p6",
    name: "AI Sepsis Prediction in ICU Settings",
    description: "Systematic review of predictive models for early sepsis detection.",
    status: "harvesting",
    statusText: "Status: Harvesting papers...",
    progress: { phase: "Phase 1 of 4: Screening", percent: 32, papers: 18 },
    modified: "2025-12-05T09:15:00",
    created: "2025-12-01",
  },
  {
    id: "p7",
    name: "Telemedicine Outcomes in Rural Primary Care",
    description: "Impact of telehealth on access, outcomes, and patient satisfaction.",
    status: "ready",
    statusText: "Status: Review Ready",
    papers: 64,
    modified: "2025-12-02T14:40:00",
    created: "2025-11-28",
  },
];

const seedProtocols: Record<string, ProtocolData> = {
  p6: {
    researchQuestion: "How effective are AI/ML early warning systems compared to standard clinical screening tools in predicting sepsis onset in adult ICU patients?",
    pico: {
      population: "Adult ICU patients at risk of sepsis",
      intervention: "AI/ML early warning systems",
      comparison: "Standard clinical screening tools",
      outcome: "Early detection accuracy, mortality, time to intervention",
    },
    eligibility: {
      inclusion: [
        "Published 2017-2025",
        "ICU or emergency department cohorts",
        "Reports model performance metrics",
        "Peer-reviewed articles",
      ],
      exclusion: [
        "Pediatric-only cohorts",
        "Case reports",
        "Non-clinical simulations",
      ],
    },
    searchStrategy: {
      query: "(sepsis OR septic) AND (predict* OR early warning) AND (machine learning OR AI)",
      databases: ["PubMed", "Embase", "Cochrane", "IEEE Xplore"],
    },
    methodology: {
      studyDesigns: ["Prospective Cohort Studies", "Retrospective Cohort Studies"],
      timeFrameStart: "2017",
      timeFrameEnd: "2025",
      qualityAssessmentTool: "QUADAS-2",
      qualityAssessmentNotes: "Assess risk of bias across patient selection, index test, and reference standard.",
    },
  },
  p7: {
    researchQuestion: "What is the impact of telemedicine consultations compared to in-person care on healthcare access, clinical outcomes, and patient satisfaction in rural primary care settings?",
    pico: {
      population: "Adults in rural primary care settings",
      intervention: "Telemedicine consultations",
      comparison: "In-person care",
      outcome: "Access metrics, clinical outcomes, satisfaction",
    },
    eligibility: {
      inclusion: [
        "Published 2015-2025",
        "Rural or underserved populations",
        "Reports outcomes or satisfaction",
      ],
      exclusion: [
        "Urban-only studies",
        "Editorials",
      ],
    },
    searchStrategy: {
      query: "(telemedicine OR telehealth) AND (rural OR underserved) AND (outcome OR satisfaction)",
      databases: ["Scopus", "Web of Science", "PubMed"],
    },
    methodology: {
      studyDesigns: ["Cross-sectional Studies", "Prospective Cohort Studies"],
      timeFrameStart: "2015",
      timeFrameEnd: "2025",
      qualityAssessmentTool: "Newcastle-Ottawa Scale (NOS)",
      qualityAssessmentNotes: "Assess selection, comparability, and outcomes across study designs.",
    },
  },
};

const seedLedger: Record<string, Study[]> = {
  p6: [
    { id: "p6-s1", title: "Sepsis prediction with ICU vital streams", authors: "Lopez et al.", year: 2021, status: "extracted", quality: "High" },
    { id: "p6-s2", title: "Early warning ML model in ED", authors: "Chen et al.", year: 2020, status: "pending", quality: "-" },
    { id: "p6-s3", title: "Benchmarking sepsis detection models", authors: "Singh et al.", year: 2022, status: "pending", quality: "Medium" },
  ],
  p7: [
    { id: "p7-s1", title: "Telehealth and access in rural clinics", authors: "Garcia et al.", year: 2019, status: "extracted", quality: "High" },
    { id: "p7-s2", title: "Virtual visits and chronic care outcomes", authors: "Brooks et al.", year: 2021, status: "pending", quality: "-" },
    { id: "p7-s3", title: "Patient satisfaction in remote care", authors: "Patel et al.", year: 2020, status: "extracted", quality: "Medium" },
  ],
};

const docFromText = (text: string): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text }],
    },
  ],
});

const buildDraftState = (projectId: string): DraftState => {
  const base = createDefaultDraftState();
  const content = { ...base.contentBySection };

  if (projectId === "p6") {
    content.abstract = docFromText(
      "We review AI-driven early warning systems for sepsis prediction in ICU settings, focusing on detection accuracy and clinical impact."
    );
    content.methods = docFromText(
      "We searched PubMed, Embase, Cochrane, and IEEE Xplore for studies between 2017 and 2025 reporting model performance metrics."
    );
    content.results = docFromText(
      "Across 18 studies, AUROC ranged from 0.78 to 0.93, with improved lead times of 2 to 6 hours."
    );
  }

  if (projectId === "p7") {
    content.abstract = docFromText(
      "This review examines telemedicine outcomes in rural primary care, emphasizing access and patient satisfaction."
    );
    content.methods = docFromText(
      "We included studies from 2015-2025 comparing telemedicine to in-person care in rural populations."
    );
    content.discussion = docFromText(
      "Telemedicine improved appointment availability and reduced travel burden, with mixed effects on clinical outcomes."
    );
  }

  return {
    ...base,
    contentBySection: content,
  };
};

const buildProjectCopilot = (): ProjectCopilotState => {
  const state = createDefaultProjectCopilotState();
  const message: CopilotMessage = {
    id: `m-${Date.now()}`,
    sender: "ai",
    text: "I can help summarize your evidence or draft section-specific text.",
    createdAt: new Date().toISOString(),
    context: { page: "draft" },
  };
  return {
    ...state,
    messages: [message],
  };
};

function isBrowser() {
  return typeof window !== "undefined";
}

export function seedLocalStorageIfEmpty(): { seeded: boolean; projectsAdded: number } {
  if (!isBrowser()) return { seeded: false, projectsAdded: 0 };

  const raw = window.localStorage.getItem(PROJECTS_KEY);
  if (!raw) {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify([]));
  }

  const existing = loadProjects([]);
  const existingIds = new Set(existing.map((p) => p.id));
  const toAdd = seedProjects.filter((p) => !existingIds.has(p.id));

  if (!toAdd.length) {
    return { seeded: false, projectsAdded: 0 };
  }

  const merged = [...existing, ...toAdd];
  saveProjects(merged);

  for (const project of toAdd) {
    const protocol = seedProtocols[project.id];
    if (protocol && !hasProtocolData(project.id)) {
      saveProtocolData(project.id, protocol);
    }

    const ledgerKey = `${LEDGER_PREFIX}${project.id}`;
    if (!window.localStorage.getItem(ledgerKey)) {
      const ledger = seedLedger[project.id] ?? [];
      saveLedger(project.id, ledger);
    }

    const draftKey = `${DRAFT_PREFIX}:${project.id}`;
    if (!window.localStorage.getItem(draftKey)) {
      const draft = buildDraftState(project.id);
      saveDraftState(project.id, draft);
    }

    const copilotKey = `${COPILOT_PREFIX}:${project.id}`;
    if (!window.localStorage.getItem(copilotKey)) {
      const copilot = buildProjectCopilot();
      saveProjectCopilotState(project.id, copilot);
    }
  }

  return { seeded: true, projectsAdded: toAdd.length };
}
