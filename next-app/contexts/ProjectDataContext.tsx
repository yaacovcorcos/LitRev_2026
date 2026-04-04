"use client";

import {
    createContext,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { getProtocolAction, saveProtocolAction } from "@/app/actions/protocols";
import { listStudiesAction } from "@/app/actions/ledger";
import { getDraftAction } from "@/app/actions/drafts";
import { listNotesIndexAction } from "@/app/actions/notes";
import { getProjectMemoriesAction } from "@/app/actions/memory";
import {
    addProjectDataChangedListener,
    type ProjectDataDomain,
    type ProjectDataChangedDetail,
} from "@/lib/project-data-events";
import { useLedger } from "@/contexts/LedgerContext";
import {
    applyProtocolArtifactPatch,
    getProtocolPatchSummary,
    protocolPatchConflictsWithTrackedPaths,
    type ProtocolArtifactPatch,
    type ProtocolSaveState,
} from "@/lib/protocol-live-sync";
import {
    loadProtocolStorageEntry,
    saveProtocolStorageEntry,
    type ProtocolStorageSource,
} from "@/lib/protocol-storage";
import { isProtocolLiveSyncV1Enabled } from "@/lib/protocol-live-sync-feature-flags";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";
import type { Study } from "@/types/ledger";
import type { ProjectMemory } from "@/types/memory";
import type { DraftState } from "@/lib/draft-storage";
import type { NoteIndexItem } from "@/lib/server/notes";
import type { ProjectBootMode } from "@/lib/project-entry-boot-mode";

type LoadState = "idle" | "loading" | "ready" | "error";

type DomainSlice<T> = {
    data: T | null;
    state: LoadState;
    error: string | null;
};

type PendingProtocolPatch = {
    patch: ProtocolArtifactPatch;
    queuedAtMs: number;
    summary: string;
};

type ProtocolDomainSlice = DomainSlice<ProtocolData> & {
    saveState: ProtocolSaveState;
    saveError: string | null;
    hasUnsyncedLocalChanges: boolean;
    lastSavedAtMs: number | null;
    lastSyncedAtMs: number | null;
    pendingPatch: PendingProtocolPatch | null;
};

type UpdateProtocolOptions = {
    dirtyPaths?: string[];
    source?: ProtocolStorageSource;
    flush?: boolean;
};

type ProjectDataContextValue = {
    projectId: string;
    protocol: ProtocolDomainSlice;
    studies: DomainSlice<Study[]>;
    draft: DomainSlice<DraftState>;
    notesList: DomainSlice<NoteIndexItem[]>;
    memory: DomainSlice<ProjectMemory[]>;
    warmDomain: (domain: ProjectDataDomain) => void;
    invalidateDomain: (domain: ProjectDataDomain) => void;
    updateProtocol: (
        updater: (prev: ProtocolData) => ProtocolData,
        options?: UpdateProtocolOptions
    ) => void;
    flushProtocolSave: () => Promise<boolean>;
    setProtocolFocusedField: (fieldPath: string | null) => void;
    setProtocolFieldDirty: (fieldPath: string, dirty: boolean) => void;
    applyPendingProtocolPatch: () => void;
    keepLocalProtocolEdits: () => void;
};

const INITIAL_SLICE: DomainSlice<never> = { data: null, state: "idle", error: null };
const INITIAL_PROTOCOL_SLICE: ProtocolDomainSlice = {
    data: null,
    state: "idle",
    error: null,
    saveState: "idle",
    saveError: null,
    hasUnsyncedLocalChanges: false,
    lastSavedAtMs: null,
    lastSyncedAtMs: null,
    pendingPatch: null,
};

export const ProjectDataContext = createContext<ProjectDataContextValue | null>(null);

const PROTOCOL_SAVE_DEBOUNCE_MS = 500;

function hasUnsyncedChanges(
    lastSavedAtMs: number,
    lastSyncedAtMs: number,
    hasPendingTimer: boolean,
    isSaving: boolean
): boolean {
    return lastSavedAtMs > lastSyncedAtMs || hasPendingTimer || isSaving;
}

export function ProjectDataProvider({
    projectId,
    bootMode,
    children,
}: {
    projectId: string;
    bootMode: ProjectBootMode;
    children: ReactNode;
}) {
    const [protocol, setProtocol] = useState<ProtocolDomainSlice>(INITIAL_PROTOCOL_SLICE);
    const [studies, setStudies] = useState<DomainSlice<Study[]>>(INITIAL_SLICE);
    const [draft, setDraft] = useState<DomainSlice<DraftState>>(INITIAL_SLICE);
    const [notesList, setNotesList] = useState<DomainSlice<NoteIndexItem[]>>(INITIAL_SLICE);
    const [memory, setMemory] = useState<DomainSlice<ProjectMemory[]>>(INITIAL_SLICE);

    const { seedProject } = useLedger();

    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

    const protocolRef = useRef<ProtocolData | null>(null);
    const protocolVersionRef = useRef(0);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const saveInFlightRef = useRef(false);
    const resaveAfterCurrentRef = useRef(false);
    const focusedFieldRef = useRef<string | null>(null);
    const dirtyFieldPathsRef = useRef<Set<string>>(new Set());
    const pendingPatchRef = useRef<ProtocolArtifactPatch | null>(null);
    const lastSavedAtRef = useRef(0);
    const currentSnapshotSyncedAtRef = useRef(0);

    const clearProtocolSaveTimer = useCallback(() => {
        if (!saveTimerRef.current) return;
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
    }, []);

    const setProtocolSnapshot = useCallback(
        (
            nextProtocol: ProtocolData,
            options: {
                saveState: ProtocolSaveState;
                saveError?: string | null;
                savedAtMs: number;
                lastSyncedAtMs: number;
                pendingPatch?: PendingProtocolPatch | null;
            }
        ) => {
            protocolRef.current = nextProtocol;
            lastSavedAtRef.current = options.savedAtMs;
            currentSnapshotSyncedAtRef.current = options.lastSyncedAtMs;

            setProtocol((prev) => ({
                ...prev,
                data: nextProtocol,
                state: "ready",
                error: null,
                saveState: options.saveState,
                saveError: options.saveError ?? null,
                hasUnsyncedLocalChanges: options.savedAtMs > options.lastSyncedAtMs,
                lastSavedAtMs: options.savedAtMs || null,
                lastSyncedAtMs: options.lastSyncedAtMs || null,
                pendingPatch: options.pendingPatch ?? null,
            }));
        },
        []
    );

    const persistProtocolLocally = useCallback(
        (data: ProtocolData, source: ProtocolStorageSource, savedAtMs = Date.now()) => {
            lastSavedAtRef.current = savedAtMs;
            saveProtocolStorageEntry(projectIdRef.current, {
                protocol: data,
                savedAtMs,
                lastSyncedAtMs: currentSnapshotSyncedAtRef.current,
                source,
            });

            setProtocol((prev) => ({
                ...prev,
                data,
                state: "ready",
                error: null,
                lastSavedAtMs: savedAtMs,
                lastSyncedAtMs: currentSnapshotSyncedAtRef.current || null,
                hasUnsyncedLocalChanges: savedAtMs > currentSnapshotSyncedAtRef.current,
            }));
        },
        []
    );

    const flushProtocolSave = useCallback(async (): Promise<boolean> => {
        clearProtocolSaveTimer();

        const pid = projectIdRef.current;
        const current = protocolRef.current;
        if (!pid || !current) return false;

        if (pendingPatchRef.current) {
            setProtocol((prev) => ({ ...prev, saveState: "local-only" }));
            return false;
        }

        if (saveInFlightRef.current) {
            resaveAfterCurrentRef.current = true;
            return false;
        }

        saveInFlightRef.current = true;
        const versionAtStart = protocolVersionRef.current;
        const snapshot = current;

        setProtocol((prev) => ({
            ...prev,
            saveState: "saving",
            saveError: null,
            hasUnsyncedLocalChanges: true,
        }));

        try {
            const result = await saveProtocolAction(pid, snapshot);
            if (projectIdRef.current !== pid) {
                return false;
            }

            if (!result.success) {
                setProtocol((prev) => ({
                    ...prev,
                    saveState: "error",
                    saveError: result.error,
                    hasUnsyncedLocalChanges: true,
                }));
                return false;
            }

            const syncedAtMs = Date.now();
            const latestVersion = protocolVersionRef.current;
            const snapshotStillCurrent = latestVersion === versionAtStart && !pendingPatchRef.current;

            if (snapshotStillCurrent) {
                currentSnapshotSyncedAtRef.current = syncedAtMs;
            }

            saveProtocolStorageEntry(pid, {
                protocol: protocolRef.current ?? snapshot,
                savedAtMs: lastSavedAtRef.current || syncedAtMs,
                lastSyncedAtMs: snapshotStillCurrent
                    ? syncedAtMs
                    : currentSnapshotSyncedAtRef.current,
                source: "remote",
            });

            const unsynced = hasUnsyncedChanges(
                lastSavedAtRef.current,
                currentSnapshotSyncedAtRef.current,
                false,
                false
            );

            setProtocol((prev) => ({
                ...prev,
                saveState: unsynced ? "saving" : "saved",
                saveError: null,
                lastSyncedAtMs: currentSnapshotSyncedAtRef.current || null,
                hasUnsyncedLocalChanges: unsynced,
            }));

            if (unsynced) {
                resaveAfterCurrentRef.current = true;
            }

            return true;
        } catch (error) {
            if (projectIdRef.current !== pid) {
                return false;
            }
            const message = error instanceof Error ? error.message : "Failed to save protocol";
            setProtocol((prev) => ({
                ...prev,
                saveState: "error",
                saveError: message,
                hasUnsyncedLocalChanges: true,
            }));
            return false;
        } finally {
            saveInFlightRef.current = false;
            if (resaveAfterCurrentRef.current && !pendingPatchRef.current) {
                resaveAfterCurrentRef.current = false;
                clearProtocolSaveTimer();
                saveTimerRef.current = setTimeout(() => {
                    void flushProtocolSave();
                }, 0);
            }
        }
    }, [clearProtocolSaveTimer]);

    const scheduleProtocolSave = useCallback((delayMs = PROTOCOL_SAVE_DEBOUNCE_MS) => {
        clearProtocolSaveTimer();
        saveTimerRef.current = setTimeout(() => {
            void flushProtocolSave();
        }, delayMs);
    }, [clearProtocolSaveTimer, flushProtocolSave]);

    const applyIncomingProtocolPatch = useCallback(
        (patch: ProtocolArtifactPatch, options?: { forceResync?: boolean }) => {
            const current = protocolRef.current ?? createDefaultProtocolData();
            const dirtyPaths = new Set(dirtyFieldPathsRef.current);
            if (focusedFieldRef.current) {
                dirtyPaths.add(focusedFieldRef.current);
            }

            const conflict = protocolPatchConflictsWithTrackedPaths(patch, dirtyPaths);
            if (conflict && !options?.forceResync) {
                clearProtocolSaveTimer();
                pendingPatchRef.current = patch;
                setProtocol((prev) => ({
                    ...prev,
                    saveState: "local-only",
                    pendingPatch: {
                        patch,
                        queuedAtMs: Date.now(),
                        summary: getProtocolPatchSummary(patch),
                    },
                }));
                return;
            }

            const hadUnsyncedLocalChanges = hasUnsyncedChanges(
                lastSavedAtRef.current,
                currentSnapshotSyncedAtRef.current,
                !!saveTimerRef.current,
                saveInFlightRef.current
            );
            const nextProtocol = applyProtocolArtifactPatch(current, patch);
            const savedAtMs = Date.now();

            protocolVersionRef.current += 1;
            pendingPatchRef.current = null;

            if (!hadUnsyncedLocalChanges && !options?.forceResync) {
                setProtocolSnapshot(nextProtocol, {
                    saveState: "saved",
                    savedAtMs,
                    lastSyncedAtMs: savedAtMs,
                    pendingPatch: null,
                });
                saveProtocolStorageEntry(projectIdRef.current, {
                    protocol: nextProtocol,
                    savedAtMs,
                    lastSyncedAtMs: savedAtMs,
                    source: "artifact",
                });
                return;
            }

            protocolRef.current = nextProtocol;
            persistProtocolLocally(nextProtocol, "artifact", savedAtMs);
            setProtocol((prev) => ({
                ...prev,
                saveState: "saving",
                saveError: null,
                pendingPatch: null,
                hasUnsyncedLocalChanges: true,
            }));
            scheduleProtocolSave(0);
        },
        [clearProtocolSaveTimer, persistProtocolLocally, scheduleProtocolSave, setProtocolSnapshot]
    );

    const updateProtocol = useCallback(
        (
            updater: (prev: ProtocolData) => ProtocolData,
            options?: UpdateProtocolOptions
        ) => {
            const current = protocolRef.current ?? createDefaultProtocolData();
            const next = updater(current);
            if (next === current) {
                return;
            }

            protocolVersionRef.current += 1;
            protocolRef.current = next;

            for (const path of options?.dirtyPaths ?? []) {
                dirtyFieldPathsRef.current.add(path);
            }

            const savedAtMs = Date.now();
            persistProtocolLocally(next, options?.source ?? "editor", savedAtMs);
            setProtocol((prev) => ({
                ...prev,
                saveState: pendingPatchRef.current ? "local-only" : "saving",
                saveError: null,
                pendingPatch: prev.pendingPatch,
            }));

            if (pendingPatchRef.current) {
                return;
            }

            if (options?.flush) {
                void flushProtocolSave();
                return;
            }

            scheduleProtocolSave();
        },
        [flushProtocolSave, persistProtocolLocally, scheduleProtocolSave]
    );

    const setProtocolFocusedField = useCallback((fieldPath: string | null) => {
        focusedFieldRef.current = fieldPath;
    }, []);

    const setProtocolFieldDirty = useCallback((fieldPath: string, dirty: boolean) => {
        if (dirty) {
            dirtyFieldPathsRef.current.add(fieldPath);
            return;
        }
        dirtyFieldPathsRef.current.delete(fieldPath);
    }, []);

    const applyPendingProtocolPatch = useCallback(() => {
        const pending = pendingPatchRef.current;
        if (!pending) return;
        applyIncomingProtocolPatch(pending, { forceResync: true });
    }, [applyIncomingProtocolPatch]);

    const keepLocalProtocolEdits = useCallback(() => {
        if (!pendingPatchRef.current) return;
        pendingPatchRef.current = null;
        setProtocol((prev) => ({
            ...prev,
            pendingPatch: null,
            saveState: "saving",
            saveError: null,
            hasUnsyncedLocalChanges: true,
        }));
        scheduleProtocolSave(0);
    }, [scheduleProtocolSave]);

    useEffect(() => {
        clearProtocolSaveTimer();
        protocolRef.current = null;
        protocolVersionRef.current = 0;
        saveInFlightRef.current = false;
        resaveAfterCurrentRef.current = false;
        focusedFieldRef.current = null;
        dirtyFieldPathsRef.current = new Set();
        pendingPatchRef.current = null;
        lastSavedAtRef.current = 0;
        currentSnapshotSyncedAtRef.current = 0;
        setProtocol(INITIAL_PROTOCOL_SLICE);
        setStudies(INITIAL_SLICE);
        setDraft(INITIAL_SLICE);
        setNotesList(INITIAL_SLICE);
        setMemory(INITIAL_SLICE);
    }, [clearProtocolSaveTimer, projectId]);

    const fetchProtocol = useCallback(async (pid: string) => {
        setProtocol((prev) => ({
            ...prev,
            state: "loading",
            error: null,
        }));

        let remoteError: string | null = null;
        let remoteData: ProtocolData | null = null;

        try {
            const result = await getProtocolAction(pid);
            if (projectIdRef.current !== pid) return;
            if (result.success && result.data) {
                remoteData = result.data;
            } else if (!result.success) {
                remoteError = result.error;
            }
        } catch (error) {
            if (projectIdRef.current !== pid) return;
            remoteError = error instanceof Error ? error.message : "Failed to load protocol";
        }

        const localEntry = loadProtocolStorageEntry(pid);
        const hasUnsyncedLocalBackup = !!localEntry && localEntry.savedAtMs > localEntry.lastSyncedAtMs;

        if (hasUnsyncedLocalBackup && localEntry) {
            protocolVersionRef.current += 1;
            setProtocolSnapshot(localEntry.protocol, {
                saveState: "local-only",
                savedAtMs: localEntry.savedAtMs,
                lastSyncedAtMs: localEntry.lastSyncedAtMs,
                pendingPatch: null,
            });
            scheduleProtocolSave(0);
            return;
        }

        if (remoteData) {
            const syncedAtMs = Date.now();
            saveProtocolStorageEntry(pid, {
                protocol: remoteData,
                savedAtMs: syncedAtMs,
                lastSyncedAtMs: syncedAtMs,
                source: "remote",
            });
            setProtocolSnapshot(remoteData, {
                saveState: "saved",
                savedAtMs: syncedAtMs,
                lastSyncedAtMs: syncedAtMs,
                pendingPatch: null,
            });
            return;
        }

        if (localEntry) {
            protocolVersionRef.current += 1;
            setProtocolSnapshot(localEntry.protocol, {
                saveState: "local-only",
                savedAtMs: localEntry.savedAtMs,
                lastSyncedAtMs: localEntry.lastSyncedAtMs,
                pendingPatch: null,
                saveError: remoteError,
            });
            return;
        }

        if (projectIdRef.current !== pid) return;
        setProtocol((prev) => ({
            ...prev,
            data: null,
            state: "error",
            error: remoteError ?? "Failed to load protocol",
            saveState: "idle",
            saveError: null,
            hasUnsyncedLocalChanges: false,
            lastSavedAtMs: null,
            lastSyncedAtMs: null,
            pendingPatch: null,
        }));
    }, [scheduleProtocolSave, setProtocolSnapshot]);

    const fetchStudies = useCallback(async (pid: string) => {
        setStudies({ data: null, state: "loading", error: null });
        try {
            const result = await listStudiesAction(pid);
            if (projectIdRef.current !== pid) return;
            if (result.success) {
                setStudies({ data: result.data, state: "ready", error: null });
                seedProject(pid, result.data);
            } else {
                setStudies({ data: null, state: "error", error: result.error });
            }
        } catch (error) {
            if (projectIdRef.current !== pid) return;
            setStudies({ data: null, state: "error", error: (error as Error).message });
        }
    }, [seedProject]);

    const fetchDraft = useCallback(async (pid: string) => {
        setDraft({ data: null, state: "loading", error: null });
        try {
            const result = await getDraftAction(pid);
            if (projectIdRef.current !== pid) return;
            if (result.success) {
                setDraft({ data: result.data, state: "ready", error: null });
            } else {
                setDraft({ data: null, state: "error", error: result.error });
            }
        } catch (error) {
            if (projectIdRef.current !== pid) return;
            setDraft({ data: null, state: "error", error: (error as Error).message });
        }
    }, []);

    const fetchNotesList = useCallback(async (pid: string) => {
        setNotesList({ data: null, state: "loading", error: null });
        try {
            const result = await listNotesIndexAction(pid);
            if (projectIdRef.current !== pid) return;
            if (result.success) {
                setNotesList({ data: result.data, state: "ready", error: null });
            } else {
                setNotesList({ data: null, state: "error", error: result.error });
            }
        } catch (error) {
            if (projectIdRef.current !== pid) return;
            setNotesList({ data: null, state: "error", error: (error as Error).message });
        }
    }, []);

    const fetchMemory = useCallback(async (pid: string) => {
        setMemory({ data: null, state: "loading", error: null });
        try {
            const result = await getProjectMemoriesAction(pid, { status: "active" });
            if (projectIdRef.current !== pid) return;
            if (result.success) {
                setMemory({ data: result.data as ProjectMemory[], state: "ready", error: null });
            } else {
                setMemory({ data: null, state: "error", error: result.error });
            }
        } catch (error) {
            if (projectIdRef.current !== pid) return;
            setMemory({ data: null, state: "error", error: (error as Error).message });
        }
    }, []);

    const domainState = useCallback(
        (domain: ProjectDataDomain): LoadState => {
            switch (domain) {
                case "protocol":
                    return protocol.state;
                case "ledger":
                    return studies.state;
                case "draft":
                    return draft.state;
                case "notes":
                    return notesList.state;
                case "memory":
                    return memory.state;
                default:
                    return "idle";
            }
        },
        [draft.state, memory.state, notesList.state, protocol.state, studies.state]
    );

    const domainFetcher = useCallback(
        (domain: ProjectDataDomain): ((pid: string) => Promise<void>) | null => {
            switch (domain) {
                case "protocol":
                    return fetchProtocol;
                case "ledger":
                    return fetchStudies;
                case "draft":
                    return fetchDraft;
                case "notes":
                    return fetchNotesList;
                case "memory":
                    return fetchMemory;
                default:
                    return null;
            }
        },
        [fetchDraft, fetchMemory, fetchNotesList, fetchProtocol, fetchStudies]
    );

    const warmDomain = useCallback((domain: ProjectDataDomain) => {
        const state = domainState(domain);
        if (state === "loading" || state === "ready") return;
        const fetcher = domainFetcher(domain);
        if (fetcher) {
            void fetcher(projectId);
        }
    }, [domainFetcher, domainState, projectId]);

    const invalidateDomain = useCallback((domain: ProjectDataDomain) => {
        const fetcher = domainFetcher(domain);
        if (fetcher) {
            void fetcher(projectId);
        }
    }, [domainFetcher, projectId]);

    useEffect(() => {
        if (!projectId) return;
        const pid = projectId;

        if (bootMode === "protocol") {
            void fetchProtocol(pid);
            return;
        }

        if (bootMode === "ledger") {
            void fetchStudies(pid);
        }
    }, [bootMode, fetchProtocol, fetchStudies, projectId]);

    const handleProjectDataChanged = useCallback((detail: ProjectDataChangedDetail) => {
        if (detail.projectId !== projectIdRef.current) return;

        const liveSyncEnabled = isProtocolLiveSyncV1Enabled();

        for (const domain of detail.domains) {
            if (domain === "protocol") {
                if (liveSyncEnabled && detail.protocolPatch) {
                    applyIncomingProtocolPatch(detail.protocolPatch);
                    continue;
                }
            }

            const fetcher = domainFetcher(domain);
            if (fetcher) {
                void fetcher(projectIdRef.current);
            }
        }
    }, [applyIncomingProtocolPatch, domainFetcher]);

    useEffect(() => addProjectDataChangedListener(handleProjectDataChanged), [handleProjectDataChanged]);

    useEffect(() => {
        const handler = (event: Event) => {
            const pid = (event as CustomEvent).detail?.projectId as string | undefined;
            if (pid && pid === projectId) {
                void fetchStudies(projectId);
            }
        };
        window.addEventListener("litrev:ledger-changed", handler);
        return () => window.removeEventListener("litrev:ledger-changed", handler);
    }, [fetchStudies, projectId]);

    useEffect(() => {
        const flush = () => {
            void flushProtocolSave();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                flush();
            }
        };

        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [flushProtocolSave]);

    const value = useMemo<ProjectDataContextValue>(() => ({
        projectId,
        protocol,
        studies,
        draft,
        notesList,
        memory,
        warmDomain,
        invalidateDomain,
        updateProtocol,
        flushProtocolSave,
        setProtocolFocusedField,
        setProtocolFieldDirty,
        applyPendingProtocolPatch,
        keepLocalProtocolEdits,
    }), [
        applyPendingProtocolPatch,
        draft,
        flushProtocolSave,
        invalidateDomain,
        keepLocalProtocolEdits,
        memory,
        notesList,
        projectId,
        protocol,
        setProtocolFieldDirty,
        setProtocolFocusedField,
        studies,
        updateProtocol,
        warmDomain,
    ]);

    return (
        <ProjectDataContext.Provider value={value}>
            {children}
        </ProjectDataContext.Provider>
    );
}
