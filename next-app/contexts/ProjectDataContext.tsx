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
import { getProtocolAction } from "@/app/actions/protocols";
import { listStudiesAction } from "@/app/actions/ledger";
import { getDraftAction } from "@/app/actions/drafts";
import { listNotesIndexAction } from "@/app/actions/notes";
import {
    addProjectDataChangedListener,
    type ProjectDataDomain,
} from "@/lib/project-data-events";
import { shouldSkipPreload } from "@/lib/network-aware";
import type { ProtocolData } from "@/types/protocol";
import type { Study } from "@/types/ledger";
import type { DraftState } from "@/lib/draftStorage";
import type { NoteIndexItem } from "@/lib/server/notes";

// ── Types ────────────────────────────────────────────────────────────────────

type LoadState = "idle" | "loading" | "ready" | "error";

type DomainSlice<T> = {
    data: T | null;
    state: LoadState;
    error: string | null;
};

type ProjectDataContextValue = {
    projectId: string;
    protocol: DomainSlice<ProtocolData>;
    studies: DomainSlice<Study[]>;
    draft: DomainSlice<DraftState>;
    notesList: DomainSlice<NoteIndexItem[]>;
    /** Fetch a domain if not already cached or loading. */
    warmDomain: (domain: ProjectDataDomain) => void;
    /** Force re-fetch a domain (after mutation). */
    invalidateDomain: (domain: ProjectDataDomain) => void;
};

const INITIAL_SLICE: DomainSlice<never> = { data: null, state: "idle", error: null };

export const ProjectDataContext = createContext<ProjectDataContextValue | null>(null);

// ── Helpers ──────────────────────────────────────────────────────────────────

const scheduleIdle = (fn: () => void) => {
    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(fn);
    } else {
        setTimeout(fn, 100);
    }
};

// ── Provider ─────────────────────────────────────────────────────────────────

export function ProjectDataProvider({
    projectId,
    children,
}: {
    projectId: string;
    children: ReactNode;
}) {
    const [protocol, setProtocol] = useState<DomainSlice<ProtocolData>>(INITIAL_SLICE);
    const [studies, setStudies] = useState<DomainSlice<Study[]>>(INITIAL_SLICE);
    const [draft, setDraft] = useState<DomainSlice<DraftState>>(INITIAL_SLICE);
    const [notesList, setNotesList] = useState<DomainSlice<NoteIndexItem[]>>(INITIAL_SLICE);

    // Track current projectId to discard stale in-flight results
    const projectIdRef = useRef(projectId);
    projectIdRef.current = projectId;

    // Reset all slices when project changes
    useEffect(() => {
        setProtocol(INITIAL_SLICE);
        setStudies(INITIAL_SLICE);
        setDraft(INITIAL_SLICE);
        setNotesList(INITIAL_SLICE);
    }, [projectId]);

    // ── Domain fetchers ──────────────────────────────────────────────────────

    const fetchProtocol = useCallback(async (pid: string) => {
        setProtocol({ data: null, state: "loading", error: null });
        try {
            const result = await getProtocolAction(pid);
            if (projectIdRef.current !== pid) return;
            if (result.success) {
                setProtocol({ data: result.data, state: "ready", error: null });
            } else {
                setProtocol({ data: null, state: "error", error: result.error });
            }
        } catch (e) {
            if (projectIdRef.current !== pid) return;
            setProtocol({ data: null, state: "error", error: (e as Error).message });
        }
    }, []);

    const fetchStudies = useCallback(async (pid: string) => {
        setStudies({ data: null, state: "loading", error: null });
        try {
            const result = await listStudiesAction(pid);
            if (projectIdRef.current !== pid) return;
            if (result.success) {
                setStudies({ data: result.data, state: "ready", error: null });
            } else {
                setStudies({ data: null, state: "error", error: result.error });
            }
        } catch (e) {
            if (projectIdRef.current !== pid) return;
            setStudies({ data: null, state: "error", error: (e as Error).message });
        }
    }, []);

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
        } catch (e) {
            if (projectIdRef.current !== pid) return;
            setDraft({ data: null, state: "error", error: (e as Error).message });
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
        } catch (e) {
            if (projectIdRef.current !== pid) return;
            setNotesList({ data: null, state: "error", error: (e as Error).message });
        }
    }, []);

    // ── Lookup for domain state + setter ─────────────────────────────────────

    const domainState = useCallback(
        (domain: ProjectDataDomain): LoadState => {
            switch (domain) {
                case "protocol": return protocol.state;
                case "ledger": return studies.state;
                case "draft": return draft.state;
                case "notes": return notesList.state;
                default: return "idle";
            }
        },
        [protocol.state, studies.state, draft.state, notesList.state],
    );

    const domainFetcher = useCallback(
        (domain: ProjectDataDomain): ((pid: string) => Promise<void>) | null => {
            switch (domain) {
                case "protocol": return fetchProtocol;
                case "ledger": return fetchStudies;
                case "draft": return fetchDraft;
                case "notes": return fetchNotesList;
                default: return null;
            }
        },
        [fetchProtocol, fetchStudies, fetchDraft, fetchNotesList],
    );

    // ── Public API ───────────────────────────────────────────────────────────

    const warmDomain = useCallback(
        (domain: ProjectDataDomain) => {
            const state = domainState(domain);
            if (state === "loading" || state === "ready") return; // dedup
            const fetcher = domainFetcher(domain);
            if (fetcher) fetcher(projectId);
        },
        [projectId, domainState, domainFetcher],
    );

    const invalidateDomain = useCallback(
        (domain: ProjectDataDomain) => {
            const fetcher = domainFetcher(domain);
            if (fetcher) fetcher(projectId);
        },
        [projectId, domainFetcher],
    );

    // ── Priority warmup on mount ─────────────────────────────────────────────

    useEffect(() => {
        if (!projectId) return;
        const pid = projectId;
        const skipHeavy = shouldSkipPreload();

        // 1. Protocol first (small, cross-cutting)
        fetchProtocol(pid).then(() => {
            if (projectIdRef.current !== pid) return;
            // 2. Studies after protocol settles
            fetchStudies(pid);
        });

        // 3 & 4. Draft and notes on idle (skip on slow connections)
        if (!skipHeavy) {
            scheduleIdle(() => {
                if (projectIdRef.current !== pid) return;
                fetchDraft(pid);
            });
            scheduleIdle(() => {
                if (projectIdRef.current !== pid) return;
                fetchNotesList(pid);
            });
        }
    }, [projectId, fetchProtocol, fetchStudies, fetchDraft, fetchNotesList]);

    // ── Event-driven invalidation ────────────────────────────────────────────

    useEffect(() => {
        const unsub = addProjectDataChangedListener((detail) => {
            if (detail.projectId !== projectId) return;
            for (const domain of detail.domains) {
                const fetcher = domainFetcher(domain);
                if (fetcher) fetcher(projectId);
            }
        });
        return unsub;
    }, [projectId, domainFetcher]);

    // Legacy ledger-changed compat
    useEffect(() => {
        const handler = (e: Event) => {
            const pid = (e as CustomEvent).detail?.projectId as string | undefined;
            if (pid && pid === projectId) {
                fetchStudies(projectId);
            }
        };
        window.addEventListener("litrev:ledger-changed", handler);
        return () => window.removeEventListener("litrev:ledger-changed", handler);
    }, [projectId, fetchStudies]);

    // ── Context value ────────────────────────────────────────────────────────

    const value = useMemo<ProjectDataContextValue>(
        () => ({
            projectId,
            protocol,
            studies,
            draft,
            notesList,
            warmDomain,
            invalidateDomain,
        }),
        [projectId, protocol, studies, draft, notesList, warmDomain, invalidateDomain],
    );

    return (
        <ProjectDataContext.Provider value={value}>
            {children}
        </ProjectDataContext.Provider>
    );
}
