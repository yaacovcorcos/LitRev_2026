"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { isAuthError, redirectToLogin } from "@/lib/action-client";
import { openOrCreateDemoProjectAction } from "@/app/actions/demo";
import { AppShell } from "@/components/AppShell";
import { ControlsBar } from "@/components/ControlsBar";
import { Modal } from "@/components/Modal";
import { ProjectGrid } from "@/components/ProjectGrid";
import { TopBar } from "@/components/TopBar";
import { useProjects } from "@/contexts/ProjectsContext";
import { isDemoProject } from "@/lib/demo/constants";
import {
  recordFoundationRouteFlowCompleted,
  useFoundationRouteReady,
} from "@/lib/mobile/foundation-reliability";
import { loadSortPreference, loadViewPreference, saveSortPreference, saveViewPreference } from "@/lib/storage";
import type { HomeWorkspaceBootstrap } from "@/types/home-bootstrap";
import type { Project } from "@/types/project";
import type { SortMode, ViewMode } from "@/types/view";
import layoutStyles from "./home.module.css";

const VALID_SORTS: SortMode[] = ["name", "created", "modified"];
const VALID_VIEWS: ViewMode[] = ["grid", "list"];
const LAST_PROJECT_STORAGE_KEY = "litrev:lastProjectId";
const HOME_ENTERED_WORKSPACE_KEY = "litrev:enteredWorkspaceFromWelcome";

declare global {
  interface Window {
    __litrevHomePerf?: {
      seedSource?: "seed_hit" | "seed_miss";
      homeReadyMs?: number;
      backgroundRefreshStarted?: boolean;
      backgroundRefreshFinishedMs?: number;
      state?: string;
    };
  }
}

type HomeClientProps = {
  bootstrap: HomeWorkspaceBootstrap;
  shouldOpenFromQuery: boolean;
};

function generateProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `p-${crypto.randomUUID()}`;
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildProject(
  name: string,
  description: string,
  options?: { id?: string; statusText?: string; papers?: number },
): Project {
  const now = new Date().toISOString();
  return {
    id: options?.id ?? generateProjectId(),
    name,
    description,
    status: "ready",
    statusText: options?.statusText ?? "Status: Review Ready",
    papers: options?.papers ?? 0,
    modified: now,
    created: now,
  };
}

export function HomeClient({ bootstrap, shouldOpenFromQuery }: HomeClientProps) {
  const {
    projects,
    authState,
    homeBootstrapState,
    usedSeededBootstrap,
    addProject,
    isInitialized,
    isLoadingProjects,
    projectsError,
    refresh,
    migrationStatus,
    migrationError,
    retryMigration,
  } = useProjects();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const router = useRouter();
  const routePerfStartRef = useRef<number | null>(null);
  const readyRecordedRef = useRef(false);
  const backgroundRefreshStartedRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("modified");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isOpeningSample, setIsOpeningSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false);
  const [isModalOpen, setModalOpen] = useState(() => shouldOpenFromQuery);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isSlow, setIsSlow] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const displayProjects = isHydrated ? projects : bootstrap.initialProjects;
  const displayAuthState = isHydrated ? authState : bootstrap.authState;
  const displayBootstrapState = isHydrated ? homeBootstrapState : bootstrap.homeBootstrapState;
  const displayProjectsError = isHydrated ? projectsError : bootstrap.error;
  const displayIsInitialized =
    isHydrated ? isInitialized : bootstrap.authState !== "unknown" && bootstrap.homeBootstrapState !== "loading_unknown";
  const displayIsLoadingProjects =
    isHydrated ? isLoadingProjects : bootstrap.authState === "authenticated" && !bootstrap.initialProjectsLoaded;

  useEffect(() => {
    routePerfStartRef.current = typeof window !== "undefined" ? performance.now() : null;
    if (typeof window !== "undefined") {
      window.__litrevHomePerf = {
        ...(window.__litrevHomePerf ?? {}),
        seedSource: bootstrap.initialProjectsLoaded ? "seed_hit" : "seed_miss",
      };
    }
  }, [bootstrap.initialProjectsLoaded]);

  useEffect(() => {
    const storedSort = loadSortPreference();
    if (storedSort && VALID_SORTS.includes(storedSort as SortMode)) {
      setSortMode(storedSort as SortMode);
    }
    const storedView = loadViewPreference();
    if (storedView && VALID_VIEWS.includes(storedView as ViewMode)) {
      setViewMode(storedView as ViewMode);
    }
  }, []);

  useEffect(() => {
    if (!shouldOpenFromQuery) return;
    router.replace("/", { scroll: false });
  }, [router, shouldOpenFromQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedId = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
    setLastProjectId(storedId && storedId.trim() ? storedId : null);
    const entered = window.sessionStorage.getItem(HOME_ENTERED_WORKSPACE_KEY) === "1";
    setHasEnteredWorkspace(entered);
  }, []);

  const sortedProjects = useMemo(() => {
    const copy = [...displayProjects];
    copy.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      const dateModifiedA = new Date(a.modified).getTime();
      const dateModifiedB = new Date(b.modified).getTime();
      const dateCreatedA = new Date(a.created).getTime();
      const dateCreatedB = new Date(b.created).getTime();

      if (sortMode === "name") return nameA.localeCompare(nameB);
      if (sortMode === "created") return dateCreatedB - dateCreatedA;
      return dateModifiedB - dateModifiedA;
    });
    return copy;
  }, [displayProjects, sortMode]);

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode);
    saveSortPreference(mode);
  };

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    saveViewPreference(mode);
  };

  const openModal = useCallback(() => {
    setCreateError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    if (formRef.current) {
      formRef.current.reset();
    }
  }, []);

  const handleCreateProject = async (name: string, description: string, guided: boolean) => {
    setCreateError(null);
    const created = await addProject(buildProject(name, description));
    if (!created) {
      setCreateError("Failed to create the project. Please try again.");
      return;
    }
    closeModal();
    recordFoundationRouteFlowCompleted({
      routeTemplate: "/",
      surface: "home",
      flow: "create_project",
    });
    if (guided) {
      router.push(`/project/${created.id}/onboarding`);
      return;
    }
    router.push(`/project/${created.id}`);
  };

  const handleOpenSampleProject = useCallback(async () => {
    setIsOpeningSample(true);
    setSampleError(null);
    try {
      const result = await openOrCreateDemoProjectAction();
      if (!result.success) {
        if (isAuthError(result)) {
          redirectToLogin();
          return;
        }
        const existingSample = displayProjects.find((project) => isDemoProject(project));
        if (existingSample) {
          router.push(`/project/${existingSample.id}`);
          return;
        }
        setSampleError(`Unable to open sample review. ${result.error}`);
        return;
      }
      await refresh();
      recordFoundationRouteFlowCompleted({
        routeTemplate: "/",
        surface: "home",
        flow: "open_sample_review",
      });
      router.push(`/project/${result.data.id}`);
    } catch (err) {
      console.error("Failed to open sample project", err);
      const existingSample = displayProjects.find((project) => isDemoProject(project));
      if (existingSample) {
        router.push(`/project/${existingSample.id}`);
        return;
      }
      setSampleError("Unable to open sample review. Please try again.");
    } finally {
      setIsOpeningSample(false);
    }
  }, [displayProjects, refresh, router]);

  const firstName = session?.user?.name?.split(/\s+/)[0] ?? bootstrap.userName?.split(/\s+/)[0] ?? null;
  const showMigrationAlert = migrationStatus === "failed" && Boolean(migrationError);
  const isLoadedEmpty = displayBootstrapState === "loaded_empty";
  const isZeroState = isLoadedEmpty && !hasEnteredWorkspace;
  const continueProject = useMemo(
    () => (lastProjectId ? sortedProjects.find((project) => project.id === lastProjectId) ?? null : null),
    [lastProjectId, sortedProjects],
  );

  const handleEnterWorkspace = useCallback(() => {
    recordFoundationRouteFlowCompleted({
      routeTemplate: "/",
      surface: "home",
      flow: "enter_workspace",
    });
    setHasEnteredWorkspace(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(HOME_ENTERED_WORKSPACE_KEY, "1");
    }
  }, []);

  const loadingSteps = [
    "Syncing your workspace...",
    "Loading your projects...",
    "Warming up AI tools...",
    "Preparing your reviews...",
  ];

  const showWorkspaceError =
    displayAuthState === "authenticated" &&
    displayProjectsError !== null &&
    displayBootstrapState === "loading_unknown";
  const shouldShowLoading =
    (!displayIsInitialized || displayBootstrapState === "loading_unknown") &&
    !showWorkspaceError;

  const homeState = shouldShowLoading
    ? "loading"
    : isZeroState
      ? "zero_state"
      : "workspace";

  useFoundationRouteReady({
    routeTemplate: "/",
    surface: "home",
    state: homeState,
  });

  useEffect(() => {
    if (displayIsInitialized && displayBootstrapState !== "loading_unknown") return;
    const interval = window.setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % loadingSteps.length);
    }, 1500);
    const slowTimer = window.setTimeout(() => setIsSlow(true), 5000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(slowTimer);
    };
  }, [displayBootstrapState, displayIsInitialized, loadingSteps.length]);

  useEffect(() => {
    if (!isHydrated || readyRecordedRef.current) return;
    const isReady =
      showWorkspaceError ||
      displayBootstrapState === "loaded_nonempty" ||
      isZeroState ||
      displayBootstrapState === "unauthenticated";
    if (!isReady) return;

    readyRecordedRef.current = true;
    if (typeof window !== "undefined") {
      const elapsed = routePerfStartRef.current !== null ? Math.round(performance.now() - routePerfStartRef.current) : undefined;
      window.__litrevHomePerf = {
        ...(window.__litrevHomePerf ?? {}),
        homeReadyMs: elapsed,
        state: showWorkspaceError ? "error" : displayBootstrapState,
      };
    }
  }, [displayBootstrapState, isHydrated, isZeroState, showWorkspaceError]);

  useEffect(() => {
    if (!isHydrated || !usedSeededBootstrap || !displayIsLoadingProjects) return;
    if (backgroundRefreshStartedRef.current) return;
    backgroundRefreshStartedRef.current = true;
    if (typeof window !== "undefined") {
      window.__litrevHomePerf = {
        ...(window.__litrevHomePerf ?? {}),
        backgroundRefreshStarted: true,
      };
    }
  }, [displayIsLoadingProjects, isHydrated, usedSeededBootstrap]);

  useEffect(() => {
    if (!isHydrated || !backgroundRefreshStartedRef.current || displayIsLoadingProjects) return;
    if (typeof window !== "undefined") {
      const elapsed = routePerfStartRef.current !== null ? Math.round(performance.now() - routePerfStartRef.current) : undefined;
      window.__litrevHomePerf = {
        ...(window.__litrevHomePerf ?? {}),
        backgroundRefreshFinishedMs: elapsed,
      };
    }
  }, [displayIsLoadingProjects, isHydrated]);

  const mainContent = shouldShowLoading ? (
    <div
      className={`surface-root ${layoutStyles.initializingShell}`}
      data-surface-height="phone-min"
      data-surface-gutters="responsive"
    >
      <div className={layoutStyles.initializingContent}>
        <div className={layoutStyles.initializingLogo} aria-hidden="true">
          <svg viewBox="0 0 48 48" className={layoutStyles.initializingLogoSvg} fill="none">
            <path
              d="M24 6 L24 42 M12 14 Q24 4 36 14 M10 26 Q24 18 38 26 M14 36 Q24 30 34 36"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className={layoutStyles.initializingGreeting}>
          {firstName ? `Welcome back, ${firstName}` : "Welcome to LitRev"}
        </p>
        <p
          className={layoutStyles.initializingText}
          key={loadingStep}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {loadingSteps[loadingStep]}
        </p>
        {isSlow ? (
          <div className={layoutStyles.initializingSlow}>
            <p>This is taking longer than usual.</p>
            <button
              type="button"
              className={layoutStyles.initializingRetry}
              disabled={isSessionPending}
              onClick={() => {
                if (isSessionPending) {
                  router.refresh();
                  return;
                }
                void refresh();
              }}
            >
              {isSessionPending ? "Signing you in..." : "Retry"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  ) : isZeroState || displayBootstrapState === "unauthenticated" ? (
    <div
      className={`surface-root ${layoutStyles.zeroShell}`}
      data-surface-height="phone-min"
      data-surface-gutters="responsive"
    >
      <div className={layoutStyles.zeroContent}>
        <header className={layoutStyles.zeroHeader}>
          <h1 className={layoutStyles.zeroTitle}>
            {firstName ? `Welcome, ${firstName}` : "Welcome to LitRev"}
          </h1>
          <p className={layoutStyles.zeroSubtitle}>
            What would you like to review today?
          </p>
          {showMigrationAlert ? (
            <div className={layoutStyles.migrationAlert} role="alert">
              <span>Legacy data migration failed. Retry to sync old local data.</span>
              <button
                type="button"
                className={layoutStyles.migrationRetry}
                onClick={() => {
                  void retryMigration();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
        </header>

        <div className={layoutStyles.zeroCards}>
          <button
            type="button"
            className={layoutStyles.heroCard}
            onClick={openModal}
          >
            <div className={layoutStyles.heroCardBody}>
              <span className={layoutStyles.heroCardTitle}>Start a new review</span>
              <span className={layoutStyles.heroCardDesc}>
                Create a fresh literature review from scratch
              </span>
            </div>
            <span className={`material-icons-round ${layoutStyles.heroCardIcon}`} aria-hidden="true">
              arrow_forward
            </span>
          </button>

          <div className={layoutStyles.secondaryRow}>
            <button
              type="button"
              className={layoutStyles.secondaryCard}
              onClick={() => {
                void handleOpenSampleProject();
              }}
              disabled={isOpeningSample}
            >
              <span className={`material-icons-round ${layoutStyles.secondaryCardIcon}`} aria-hidden="true">
                science
              </span>
              <span className={layoutStyles.secondaryCardTitle}>
                {isOpeningSample ? "Opening..." : "Explore sample"}
              </span>
              <span className={layoutStyles.secondaryCardDesc}>
                See a full workflow with real papers
              </span>
            </button>

            <button
              type="button"
              className={layoutStyles.secondaryCard}
              onClick={openModal}
            >
              <span className={`material-icons-round ${layoutStyles.secondaryCardIcon}`} aria-hidden="true">
                upload_file
              </span>
              <span className={layoutStyles.secondaryCardTitle}>Import papers</span>
              <span className={layoutStyles.secondaryCardDesc}>
                Upload PDFs or import from Zotero
              </span>
            </button>
          </div>

          <button
            type="button"
            className={layoutStyles.zeroEnter}
            onClick={handleEnterWorkspace}
            aria-label="Enter workspace without creating a project"
          >
            Enter workspace
          </button>

          {sampleError ? <p className={layoutStyles.sampleError} role="alert">{sampleError}</p> : null}
        </div>
      </div>
    </div>
  ) : (
    <AppShell activeNav="projects" onNewProject={openModal} mainClassName={layoutStyles.noSidePadding}>
      <div className={`surface-root ${layoutStyles.page}`} data-surface-height="shell">
        <div className={layoutStyles.headerArea}>
          {showMigrationAlert ? (
            <div className={layoutStyles.migrationAlert} role="alert">
              <span>Legacy data migration failed. Retry to sync old local data.</span>
              <button
                type="button"
                className={layoutStyles.migrationRetry}
                onClick={() => {
                  void retryMigration();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          {showWorkspaceError ? (
            <div className={layoutStyles.workspaceError} role="alert">
              <span>{displayProjectsError}</span>
              <button
                type="button"
                className={layoutStyles.migrationRetry}
                onClick={() => {
                  void refresh();
                }}
              >
                Retry
              </button>
            </div>
          ) : null}
          <TopBar
            title="Your Projects"
            subtitle="Keep your literature reviews organized"
            className={layoutStyles.homeTopBar}
          />

          <ControlsBar
            sortMode={sortMode}
            viewMode={viewMode}
            onSortChange={handleSortChange}
            onViewChange={handleViewChange}
            className={layoutStyles.homeControlsBar}
            viewControlsClassName={layoutStyles.homeControlsRow}
            rightActionClassName={layoutStyles.homeControlsAction}
            sortButtonClassName={layoutStyles.homeSortButton}
            viewTogglesClassName={layoutStyles.homeViewToggles}
            rightAction={
              continueProject ? (
                <Link
                  href={`/project/${continueProject.id}`}
                  prefetch={false}
                  className={layoutStyles.resumeControl}
                  aria-label={`Back to ${continueProject.name}`}
                >
                  <span className={layoutStyles.resumeControlText}>
                    <span className={layoutStyles.resumeControlLead}>Back to</span>{" "}
                    <span className={layoutStyles.resumeControlProjectName}>{continueProject.name}</span>
                  </span>
                  <span className={`material-icons-round ${layoutStyles.resumeControlArrow}`} aria-hidden="true">
                    arrow_forward
                  </span>
                </Link>
              ) : undefined
            }
          />
        </div>

        <div
          className={`surface-scroll-body ${layoutStyles.scrollArea}`}
          data-surface-padding="responsive"
        >
          <ProjectGrid
            projects={sortedProjects}
            viewMode={viewMode}
            onNewProject={openModal}
          />
        </div>
      </div>
    </AppShell>
  );

  return (
    <>
      {mainContent}

      <Modal isOpen={isModalOpen} onClose={closeModal} ariaLabelledBy="createProjectTitle">
        <div className="modal-header">
          <h2 id="createProjectTitle">What are you researching?</h2>
          <button className="close-modal-btn" aria-label="Close Modal" onClick={closeModal}>
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <form
          ref={formRef}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const formData = new FormData(form);
            const name = (formData.get("projectName") as string).trim();
            const desc = (formData.get("projectDesc") as string).trim();
            if (!name) return;
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const intent = submitter?.value === "guided" ? "guided" : "blank";
            await handleCreateProject(name, desc, intent === "guided");
            if (form.isConnected) {
              form.reset();
            }
          }}
        >
          <div className="form-group">
            <label htmlFor="projectName">Project name</label>
            <input type="text" id="projectName" name="projectName" placeholder="e.g., AI in Healthcare Review" required autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="projectDesc">Description <span className="label-optional">(optional)</span></label>
            <textarea id="projectDesc" name="projectDesc" placeholder="Brief description of the research goal..." />
          </div>
          {createError ? <p className={layoutStyles.createError} role="alert">{createError}</p> : null}
          <hr className="modal-divider" />
          <div className="modal-actions">
            <button type="button" className="btn btn-outline cancel-btn" onClick={closeModal}>
              Cancel
            </button>
            <div className="spacer" />
            <button type="submit" name="intent" value="blank" className="btn btn-outline create-btn">
              Create blank
            </button>
            <button type="submit" name="intent" value="guided" className="btn btn-primary create-btn">
              Guided setup
              <svg className="btn-guided-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
