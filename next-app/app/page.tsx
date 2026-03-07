"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ProjectGrid } from "@/components/ProjectGrid";
import { loadSortPreference, loadViewPreference, saveSortPreference, saveViewPreference } from "@/lib/storage";
import { Project } from "@/types/project";
import { TopBar } from "@/components/TopBar";
import { ControlsBar } from "@/components/ControlsBar";
import { SortMode, ViewMode } from "@/types/view";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import Link from "next/link";
import { useProjects } from "@/contexts/ProjectsContext";
import { useRouter, useSearchParams } from "next/navigation";
import { openOrCreateDemoProjectAction } from "@/app/actions/demo";
import { DEMO_PROJECT_ID } from "@/lib/demo/constants";
import { isAuthError, redirectToLogin } from "@/lib/action-client";
import { authClient } from "@/lib/auth-client";
import layoutStyles from "./home.module.css";

const VALID_SORTS: SortMode[] = ["name", "created", "modified"];
const VALID_VIEWS: ViewMode[] = ["grid", "list"];
const LAST_PROJECT_STORAGE_KEY = "litrev:lastProjectId";
const HOME_ENTERED_WORKSPACE_KEY = "litrev:enteredWorkspaceFromWelcome";

function buildProject(
  name: string,
  description: string,
  options?: { id?: string; statusText?: string; papers?: number }
): Project {
  const now = new Date().toISOString();
  return {
    id: options?.id ?? `p${Date.now()}`,
    name,
    description,
    status: "ready",
    statusText: options?.statusText ?? "Status: Review Ready",
    papers: options?.papers ?? 0,
    modified: now,
    created: now,
  };
}

function HomeContent() {
  const {
    projects,
    addProject,
    isInitialized,
    refresh,
    migrationStatus,
    migrationError,
    retryMigration,
  } = useProjects();
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortMode, setSortMode] = useState<SortMode>("modified");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isOpeningSample, setIsOpeningSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);
  const [hasEnteredWorkspace, setHasEnteredWorkspace] = useState(false);

  // Sync from localStorage after hydration to avoid SSR mismatch
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
  const shouldOpenFromQuery = searchParams.get("create") === "new";
  const [isModalOpen, setModalOpen] = useState(() => shouldOpenFromQuery);
  const formRef = useRef<HTMLFormElement | null>(null);

  const sortedProjects = useMemo(() => {
    const copy = [...projects];
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
  }, [projects, sortMode]);

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
        if (isAuthError(result)) { redirectToLogin(); return; }
        const existingSample = projects.find((project) => project.id === DEMO_PROJECT_ID);
        if (existingSample) {
          router.push(`/project/${existingSample.id}`);
          return;
        }
        setSampleError(`Unable to open sample review. ${result.error}`);
        return;
      }
      await refresh();
      router.push(`/project/${result.data.id}`);
    } catch (err) {
      console.error("Failed to open sample project", err);
      const existingSample = projects.find((project) => project.id === DEMO_PROJECT_ID);
      if (existingSample) {
        router.push(`/project/${existingSample.id}`);
        return;
      }
      setSampleError("Unable to open sample review. Please try again.");
    } finally {
      setIsOpeningSample(false);
    }
  }, [projects, refresh, router]);

  useEffect(() => {
    if (!shouldOpenFromQuery) return;
    router.replace("/", { scroll: false });
  }, [shouldOpenFromQuery, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedId = window.localStorage.getItem(LAST_PROJECT_STORAGE_KEY);
    setLastProjectId(storedId && storedId.trim() ? storedId : null);
    const entered = window.sessionStorage.getItem(HOME_ENTERED_WORKSPACE_KEY) === "1";
    setHasEnteredWorkspace(entered);
  }, []);

  const firstName = session?.user?.name?.split(/\s+/)[0] ?? null;
  const showMigrationAlert = migrationStatus === "failed" && Boolean(migrationError);
  const isNewUser = projects.length === 0;
  const continueProject = useMemo(
    () => (lastProjectId ? sortedProjects.find((project) => project.id === lastProjectId) ?? null : null),
    [lastProjectId, sortedProjects],
  );

  const handleEnterWorkspace = useCallback(() => {
    setHasEnteredWorkspace(true);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(HOME_ENTERED_WORKSPACE_KEY, "1");
    }
  }, []);

  // ── Loading-screen rotating copy ──
  const LOADING_STEPS = [
    "Syncing your workspace\u2026",
    "Loading your projects\u2026",
    "Warming up AI tools\u2026",
    "Preparing your reviews\u2026",
  ];
  const [loadingStep, setLoadingStep] = useState(0);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    const interval = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
    }, 1500);
    const slowTimer = setTimeout(() => setIsSlow(true), 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(slowTimer);
    };
  }, [isInitialized, LOADING_STEPS.length]);

  const mainContent = !isInitialized ? (
    <div className={layoutStyles.initializingShell}>
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
          {LOADING_STEPS[loadingStep]}
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
  ) : isNewUser && !hasEnteredWorkspace ? (
    <div className={layoutStyles.zeroShell}>
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
      <div className={layoutStyles.page}>
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
          <TopBar
            title="Your Projects"
            subtitle="Keep your literature reviews organized"
          />

          <ControlsBar
            sortMode={sortMode}
            viewMode={viewMode}
            onSortChange={handleSortChange}
            onViewChange={handleViewChange}
            rightAction={
              !isNewUser && continueProject ? (
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

        <div className={layoutStyles.scrollArea}>
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

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
