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
import { useProjects } from "@/contexts/ProjectsContext";
import { useRouter, useSearchParams } from "next/navigation";
import { openOrCreateDemoProjectAction } from "@/app/actions/demo";
import { DEMO_PROJECT_ID } from "@/lib/demo/constants";
import { authClient } from "@/lib/auth-client";
import layoutStyles from "./home.module.css";

const VALID_SORTS: SortMode[] = ["name", "created", "modified"];
const VALID_VIEWS: ViewMode[] = ["grid", "list"];

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
  const { projects, addProject, isInitialized, refresh } = useProjects();
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortMode, setSortMode] = useState<SortMode>("modified");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [isOpeningSample, setIsOpeningSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

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

  const firstName = session?.user?.name?.split(/\s+/)[0] ?? null;

  const mainContent = !isInitialized ? (
    <div className={layoutStyles.initializingShell}>
      <p className={layoutStyles.initializingText}>Loading workspace...</p>
    </div>
  ) : projects.length === 0 ? (
    <div className={layoutStyles.zeroShell}>
      <div className={layoutStyles.zeroContent}>
        <header className={layoutStyles.zeroHeader}>
          <h1 className={layoutStyles.zeroTitle}>
            {firstName ? `Welcome, ${firstName}` : "Welcome to LitRev"}
          </h1>
          <p className={layoutStyles.zeroSubtitle}>
            What would you like to review today?
          </p>
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

          {sampleError ? <p className={layoutStyles.sampleError} role="alert">{sampleError}</p> : null}
        </div>
      </div>
    </div>
  ) : (
    <AppShell activeNav="projects" onNewProject={openModal} mainClassName={layoutStyles.noSidePadding}>
      <div className={layoutStyles.page}>
        <div className={layoutStyles.headerArea}>
          <TopBar title="Your Projects" subtitle="Keep your literature reviews organized" />

          <ControlsBar
            sortMode={sortMode}
            viewMode={viewMode}
            onSortChange={handleSortChange}
            onViewChange={handleViewChange}
          />
        </div>

        <div className={layoutStyles.scrollArea}>
          <ProjectGrid projects={sortedProjects} viewMode={viewMode} onNewProject={openModal} />
        </div>
      </div>
    </AppShell>
  );

  return (
    <>
      {mainContent}

      <Modal isOpen={isModalOpen} onClose={closeModal} ariaLabelledBy="createProjectTitle">
        <div className="modal-header">
          <h2 id="createProjectTitle">Create New Project</h2>
          <button className="close-modal-btn" aria-label="Close Modal" onClick={closeModal}>
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <form
          ref={formRef}
          onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const name = (formData.get("projectName") as string).trim();
            const desc = (formData.get("projectDesc") as string).trim();
            if (!name) return;
            const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const intent = submitter?.value === "guided" ? "guided" : "blank";
            await handleCreateProject(name, desc, intent === "guided");
            e.currentTarget.reset();
          }}
        >
          <div className="form-group">
            <label htmlFor="projectName">Project Name</label>
            <input type="text" id="projectName" name="projectName" placeholder="e.g., AI in Healthcare Review" required />
          </div>
          <div className="form-group">
            <label htmlFor="projectDesc">Description (Optional)</label>
            <textarea id="projectDesc" name="projectDesc" placeholder="Brief description of the research goal..." rows={3} />
          </div>
          {createError ? <p className={layoutStyles.createError} role="alert">{createError}</p> : null}
          <div className="modal-actions">
            <button type="button" className="btn btn-outline cancel-btn" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" name="intent" value="blank" className="btn btn-outline create-btn">
              Create Blank Project
            </button>
            <button type="submit" name="intent" value="guided" className="btn btn-primary create-btn">
              Create with Guided Setup
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
