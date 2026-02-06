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
import layoutStyles from "./home.module.css";

const VALID_SORTS: SortMode[] = ["name", "created", "modified"];
const VALID_VIEWS: ViewMode[] = ["grid", "list"];

function HomeContent() {
  const { projects, addProject, refresh } = useProjects();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sortMode, setSortMode] = useState<SortMode>("modified");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

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

  const openModal = useCallback(() => setModalOpen(true), []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    if (formRef.current) {
      formRef.current.reset();
    }
  }, []);

  const handleCreateProject = (name: string, description: string) => {
    const newProject: Project = {
      id: "p" + Date.now(),
      name,
      description,
      status: "ready",
      statusText: "Status: Review Ready",
      papers: 0,
      modified: new Date().toISOString(),
      created: new Date().toISOString(),
    };
    addProject(newProject);
    closeModal();
  };

  useEffect(() => {
    // Refresh projects from storage on mount to ensure context has latest
    refresh();
  }, [refresh]);


  useEffect(() => {
    if (!shouldOpenFromQuery) return;
    router.replace("/", { scroll: false });
  }, [shouldOpenFromQuery, router]);


  return (
    <>
      <AppShell activeNav="projects" onNewProject={openModal} mainClassName={layoutStyles.noSidePadding}>
        <div className={layoutStyles.page}>
          <div className={layoutStyles.headerArea}>
            <TopBar
              title="Your Projects"
              subtitle="Keep your literature reviews organized"
            />

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

      <Modal isOpen={isModalOpen} onClose={closeModal} ariaLabelledBy="createProjectTitle">
        <div className="modal-header">
          <h2 id="createProjectTitle">Create New Project</h2>
          <button className="close-modal-btn" aria-label="Close Modal" onClick={closeModal}>
            <span className="material-icons-round">close</span>
          </button>
        </div>
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const name = (formData.get("projectName") as string).trim();
            const desc = (formData.get("projectDesc") as string).trim();
            if (!name) return;
            handleCreateProject(name, desc);
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
          <div className="modal-actions">
            <button type="button" className="btn btn-outline cancel-btn" onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary create-btn">
              Create Project
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
