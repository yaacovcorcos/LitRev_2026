import { loadProjects } from "@/lib/storage";
import { loadLedger } from "@/lib/ledgerStorage";
import { loadDraftState } from "@/lib/draftStorage";
import { hasProtocolData, loadProtocolData } from "@/lib/protocolStorage";
import { createProjectAction, getProjectAction } from "@/app/actions/projects";
import { listStudiesAction, replaceStudiesAction } from "@/app/actions/ledger";
import { getDraftAction, saveDraftAction } from "@/app/actions/drafts";
import { getProjectCopilotAction, saveProjectCopilotAction } from "@/app/actions/projectCopilot";
import { getProtocolAction, saveProtocolAction } from "@/app/actions/protocols";
import type { Project } from "@/types/project";

const MIGRATION_KEY = "litrev_migration_v5";
const PROJECTS_KEY = "litrev_projects_v1";
const DRAFT_KEY_PREFIX = "litrev_draft_v1";
const PROJECT_COPILOT_PREFIX = "litrev_project_copilot_v1";

function isBrowser() {
  return typeof window !== "undefined";
}

type MigrationResult = {
  migrated: boolean;
  projects: number;
  protocols: number;
  studies: number;
  drafts: number;
  projectCopilots: number;
};

export async function migrateLocalStorageToBackend(): Promise<MigrationResult> {
  if (!isBrowser()) {
    return { migrated: false, projects: 0, protocols: 0, studies: 0, drafts: 0, projectCopilots: 0 };
  }

  const status = window.localStorage.getItem(MIGRATION_KEY);
  if (status === "done") {
    return { migrated: false, projects: 0, protocols: 0, studies: 0, drafts: 0, projectCopilots: 0 };
  }

  const raw = window.localStorage.getItem(PROJECTS_KEY);
  if (!raw) {
    window.localStorage.setItem(MIGRATION_KEY, "done");
    return { migrated: false, projects: 0, protocols: 0, studies: 0, drafts: 0, projectCopilots: 0 };
  }

  let projects: Project[] = [];
  try {
    projects = loadProjects([]);
  } catch (err) {
    console.warn("Failed to read local projects for migration", err);
  }

  if (!projects.length) {
    window.localStorage.setItem(MIGRATION_KEY, "done");
    return { migrated: false, projects: 0, protocols: 0, studies: 0, drafts: 0, projectCopilots: 0 };
  }

  let migratedProjects = 0;
  let migratedProtocols = 0;
  let migratedStudies = 0;
  let migratedDrafts = 0;
  let migratedProjectCopilots = 0;
  let hadError = false;

  for (const project of projects) {
    try {
      const existing = await getProjectAction(project.id);
      if (!existing) {
        await createProjectAction(project);
        migratedProjects += 1;
      }
    } catch (err) {
      console.error("Failed to migrate project", project.id, err);
      hadError = true;
      continue;
    }

    if (hasProtocolData(project.id)) {
      try {
        const protocol = loadProtocolData(project.id);
        const existingProtocol = await getProtocolAction(project.id);
        if (!existingProtocol) {
          await saveProtocolAction(project.id, protocol);
          migratedProtocols += 1;
        }
      } catch (err) {
        console.error("Failed to migrate protocol", project.id, err);
        hadError = true;
      }
    }

    try {
      const localStudies = loadLedger(project.id, []);
      if (!localStudies.length) continue;
      const existingStudies = await listStudiesAction(project.id);
      if (!existingStudies.length) {
        const saved = await replaceStudiesAction(project.id, localStudies);
        migratedStudies += saved.length;
      }
    } catch (err) {
      console.error("Failed to migrate studies", project.id, err);
      hadError = true;
    }

    try {
      const draftKey = `${DRAFT_KEY_PREFIX}:${project.id}`;
      const draftRaw = window.localStorage.getItem(draftKey);
      if (!draftRaw) continue;
      const localDraft = loadDraftState(project.id);
      const existingDraft = await getDraftAction(project.id);
      if (!existingDraft) {
        await saveDraftAction(project.id, localDraft);
        migratedDrafts += 1;
      }
    } catch (err) {
      console.error("Failed to migrate draft", project.id, err);
      hadError = true;
    }

    try {
      const copilotKey = `${PROJECT_COPILOT_PREFIX}:${project.id}`;
      const copilotRaw = window.localStorage.getItem(copilotKey);
      if (!copilotRaw) continue;
      const existingCopilot = await getProjectCopilotAction(project.id);
      if (!existingCopilot) {
        const parsed = JSON.parse(copilotRaw);
        await saveProjectCopilotAction(project.id, parsed);
        migratedProjectCopilots += 1;
      }
    } catch (err) {
      console.error("Failed to migrate project copilot", project.id, err);
      hadError = true;
    }
  }

  if (!hadError) {
    window.localStorage.setItem(MIGRATION_KEY, "done");
  }
  return {
    migrated:
      migratedProjects > 0 ||
      migratedProtocols > 0 ||
      migratedStudies > 0 ||
      migratedDrafts > 0 ||
      migratedProjectCopilots > 0,
    projects: migratedProjects,
    protocols: migratedProtocols,
    studies: migratedStudies,
    drafts: migratedDrafts,
    projectCopilots: migratedProjectCopilots,
  };
}
