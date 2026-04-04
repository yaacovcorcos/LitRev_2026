import { loadProjects } from "@/lib/storage";
import { loadLedger } from "@/lib/ledger-storage";
import { loadDraftState } from "@/lib/draftStorage";
import { hasProtocolData, loadProtocolData } from "@/lib/protocol-storage";
import { createProjectAction, getProjectAction } from "@/app/actions/projects";
import { listStudiesAction, replaceStudiesAction } from "@/app/actions/ledger";
import { getDraftAction, saveDraftAction } from "@/app/actions/drafts";
import { getProjectConversationAction, saveProjectConversationAction } from "@/app/actions/project-conversation";
import { getProtocolAction, saveProtocolAction } from "@/app/actions/protocols";
import type { Project } from "@/types/project";

const MIGRATION_KEY = "litrev_migration_v5";
const MIGRATION_STATUS_KEY = "litrev_migration_status_v1";
const PROJECTS_KEY = "litrev_projects_v1";
const DRAFT_KEY_PREFIX = "litrev_draft_v1";
const PROJECT_CONVERSATION_PREFIX = "litrev_project_conversation_v1";
const LEGACY_PROJECT_COPILOT_PREFIX = "litrev_project_copilot_v1";

function isBrowser() {
  return typeof window !== "undefined";
}

type MigrationResult = {
  migrated: boolean;
  projects: number;
  protocols: number;
  studies: number;
  drafts: number;
  projectConversations: number;
  status: MigrationStatus;
  error?: string;
};

export type MigrationStatus = "pending" | "done" | "failed";

type MigrationOptions = {
  force?: boolean;
  timeoutMs?: number;
};

const EMPTY_COUNTS = {
  migrated: false,
  projects: 0,
  protocols: 0,
  studies: 0,
  drafts: 0,
  projectConversations: 0,
} as const;

function emptyResult(status: MigrationStatus, error?: string): MigrationResult {
  return {
    ...EMPTY_COUNTS,
    status,
    ...(error ? { error } : {}),
  };
}

function getRawMigrationStatus(): string | null {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(MIGRATION_STATUS_KEY);
}

export function getLocalStorageMigrationStatus(): MigrationStatus {
  if (!isBrowser()) return "pending";
  const status = getRawMigrationStatus();
  if (status === "pending" || status === "done" || status === "failed") {
    return status;
  }
  if (window.localStorage.getItem(MIGRATION_KEY) === "done") {
    return "done";
  }
  return "pending";
}

function setLocalStorageMigrationStatus(status: MigrationStatus) {
  if (!isBrowser()) return;
  window.localStorage.setItem(MIGRATION_STATUS_KEY, status);
  if (status === "done") {
    window.localStorage.setItem(MIGRATION_KEY, "done");
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Migration timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function migrateLocalStorageToBackend(
  options?: MigrationOptions,
): Promise<MigrationResult> {
  const force = options?.force ?? false;
  const timeoutMs = options?.timeoutMs ?? 10000;

  if (!isBrowser()) {
    return emptyResult("pending");
  }

  const currentStatus = getLocalStorageMigrationStatus();
  if (currentStatus === "done") {
    return emptyResult("done");
  }
  if (currentStatus === "failed" && !force) {
    return emptyResult("failed", "Migration previously failed. Use retry to run again.");
  }

  const runMigration = async (): Promise<MigrationResult> => {
    setLocalStorageMigrationStatus("pending");
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) {
      setLocalStorageMigrationStatus("done");
      return emptyResult("done");
    }

    let projects: Project[] = [];
    try {
      projects = loadProjects([]);
    } catch (err) {
      console.warn("Failed to read local projects for migration", err);
    }

    if (projects.length === 0) {
      setLocalStorageMigrationStatus("done");
      return emptyResult("done");
    }

    let migratedProjects = 0;
    let migratedProtocols = 0;
    let migratedStudies = 0;
    let migratedDrafts = 0;
    let migratedProjectConversations = 0;
    let hadError = false;
    let lastError: string | undefined;

    for (const project of projects) {
      try {
        const existingResult = await getProjectAction(project.id);
        if (!existingResult.success) {
          hadError = true;
          lastError = existingResult.error;
          continue;
        }
        if (!existingResult.data) {
          const createResult = await createProjectAction(project);
          if (!createResult.success) {
            hadError = true;
            lastError = createResult.error;
            continue;
          }
          migratedProjects += 1;
        }
      } catch (err) {
        console.error("Failed to migrate project", project.id, err);
        hadError = true;
        lastError = err instanceof Error ? err.message : String(err);
        continue;
      }

      if (hasProtocolData(project.id)) {
        try {
          const protocol = loadProtocolData(project.id);
          const protocolResult = await getProtocolAction(project.id);
          if (!protocolResult.success || !protocolResult.data) {
            const saveResult = await saveProtocolAction(project.id, protocol);
            if (saveResult.success) migratedProtocols += 1;
          }
        } catch (err) {
          console.error("Failed to migrate protocol", project.id, err);
          hadError = true;
        }
      }

      try {
        const localStudies = loadLedger(project.id, []);
        if (!localStudies.length) continue;
        const existingResult = await listStudiesAction(project.id);
        const existingStudies = existingResult.success ? existingResult.data : [];
        if (!existingStudies.length) {
          const saveResult = await replaceStudiesAction(project.id, localStudies);
          migratedStudies += saveResult.success ? saveResult.data.length : 0;
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
        const draftResult = await getDraftAction(project.id);
        if (!draftResult.success || !draftResult.data) {
          const saveDraftResult = await saveDraftAction(project.id, localDraft);
          if (saveDraftResult.success) migratedDrafts += 1;
        }
      } catch (err) {
        console.error("Failed to migrate draft", project.id, err);
        hadError = true;
      }

      try {
        const projectConversationKey = `${PROJECT_CONVERSATION_PREFIX}:${project.id}`;
        const legacyProjectCopilotKey = `${LEGACY_PROJECT_COPILOT_PREFIX}:${project.id}`;
        const projectConversationRaw =
          window.localStorage.getItem(projectConversationKey)
          ?? window.localStorage.getItem(legacyProjectCopilotKey);
        if (!projectConversationRaw) continue;
        const projectConversationResult = await getProjectConversationAction(project.id);
        if (!projectConversationResult.success || !projectConversationResult.data) {
          const parsed = JSON.parse(projectConversationRaw);
          const saveProjectConversationResult = await saveProjectConversationAction(project.id, parsed);
          if (saveProjectConversationResult.success) migratedProjectConversations += 1;
        }
      } catch (err) {
        console.error("Failed to migrate project conversation", project.id, err);
        hadError = true;
      }
    }

    const status: MigrationStatus = hadError ? "failed" : "done";
    setLocalStorageMigrationStatus(status);

    return {
      migrated:
        migratedProjects > 0 ||
        migratedProtocols > 0 ||
        migratedStudies > 0 ||
        migratedDrafts > 0 ||
        migratedProjectConversations > 0,
      projects: migratedProjects,
      protocols: migratedProtocols,
      studies: migratedStudies,
      drafts: migratedDrafts,
      projectConversations: migratedProjectConversations,
      status,
      error: lastError,
    };
  };

  try {
    return await withTimeout(runMigration(), timeoutMs);
  } catch (error) {
    setLocalStorageMigrationStatus("failed");
    return emptyResult(
      "failed",
      error instanceof Error ? error.message : "Migration failed unexpectedly",
    );
  }
}

export function resetLocalStorageMigrationStatus() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(MIGRATION_STATUS_KEY);
  window.localStorage.removeItem(MIGRATION_KEY);
}
