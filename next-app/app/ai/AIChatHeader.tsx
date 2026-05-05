"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReasoningMode } from "@/types/ai";
import {
  USER_SELECTABLE_MODELS,
  type ReasoningSupportTier,
  type SelectableModelId,
} from "@/lib/ai/config";
import styles from "./ai-view.module.css";

const AIChatReasoningModeDropdown = dynamic(() =>
  import("@/components/chat/ChatReasoningModeDropdown").then((module) => module.ChatReasoningModeDropdown)
);

type ProjectOption = {
  id: string;
  name: string;
};

type ReturnProject = {
  id: string;
  name: string;
  href: string;
};

type AIChatHeaderProps = {
  isPhoneViewport: boolean;
  isHistoryCollapsed: boolean;
  historyContentId: string;
  selectedProjectId: string | null;
  selectedScopeLabel: string;
  projects: ProjectOption[];
  returnProject?: ReturnProject | null;
  selectedModel: SelectableModelId;
  showReasoningControls: boolean;
  reasoningMode: ReasoningMode;
  reasoningSupport: ReasoningSupportTier;
  activeTimelineLength: number;
  onHistoryToggle: () => void;
  onNewChat: () => void;
  onSelectProject: (projectId: string | null) => void;
  onModelChange: (modelId: SelectableModelId) => void;
  onReasoningModeChange: (mode: ReasoningMode) => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
};

export function AIChatHeader({
  isPhoneViewport,
  isHistoryCollapsed,
  historyContentId,
  selectedProjectId,
  selectedScopeLabel,
  projects,
  returnProject,
  selectedModel,
  showReasoningControls,
  reasoningMode,
  reasoningSupport,
  activeTimelineLength,
  onHistoryToggle,
  onNewChat,
  onSelectProject,
  onModelChange,
  onReasoningModeChange,
  onExportMarkdown,
  onExportPdf,
}: AIChatHeaderProps) {
  const [isProjectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isMobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [isMobileMoreOpen, setMobileMoreOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);
  const mobileOptionsRef = useRef<HTMLDivElement | null>(null);
  const mobileMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isProjectDropdownOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isProjectDropdownOpen]);

  useEffect(() => {
    if (!isMobileOptionsOpen && !isMobileMoreOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (mobileOptionsRef.current && !mobileOptionsRef.current.contains(target)) {
        setMobileOptionsOpen(false);
      }
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(target)) {
        setMobileMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isMobileMoreOpen, isMobileOptionsOpen]);

  const activeExportDisabled = activeTimelineLength === 0;
  const hasMobileMoreActions = Boolean(returnProject) || !activeExportDisabled;
  const projectIcon = useMemo(() => (selectedProjectId ? "folder" : "public"), [selectedProjectId]);
  const selectedModelInfo = useMemo(
    () => USER_SELECTABLE_MODELS.find((model) => model.id === selectedModel),
    [selectedModel]
  );

  if (isPhoneViewport) {
    return (
      <div className={`${styles.chatHeader} ${styles.mobileChatHeader}`}>
        <button
          type="button"
          className={styles.mobileIconButton}
          aria-label={isHistoryCollapsed ? "Open chat history" : "Close chat history"}
          aria-expanded={!isHistoryCollapsed}
          aria-controls={historyContentId}
          onClick={onHistoryToggle}
        >
          <span className="material-icons-round">menu</span>
        </button>

        <div className={styles.mobileOptionsAnchor} ref={mobileOptionsRef}>
          <button
            type="button"
            className={styles.mobileTitlePill}
            aria-label="Open AI options"
            aria-expanded={isMobileOptionsOpen}
            onClick={() => {
              setMobileOptionsOpen((prev) => !prev);
              setMobileMoreOpen(false);
            }}
          >
            <span>LitRev AI</span>
            <span className="material-icons-round" aria-hidden="true">expand_more</span>
          </button>

          {isMobileOptionsOpen ? (
            <div className={styles.mobileOptionsSheet}>
              <div className={styles.mobileSheetGroup}>
                <span className={styles.mobileSheetLabel}>Scope</span>
                <button
                  type="button"
                  className={`${styles.mobileSheetOption} ${!selectedProjectId ? styles.mobileSheetOptionActive : ""}`}
                  onClick={() => {
                    onSelectProject(null);
                    setMobileOptionsOpen(false);
                  }}
                >
                  <span className="material-icons-round" aria-hidden="true">public</span>
                  <span>Global</span>
                </button>
                {projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`${styles.mobileSheetOption} ${selectedProjectId === project.id ? styles.mobileSheetOptionActive : ""}`}
                    onClick={() => {
                      onSelectProject(project.id);
                      setMobileOptionsOpen(false);
                    }}
                  >
                    <span className="material-icons-round" aria-hidden="true">folder</span>
                    <span>{project.name}</span>
                  </button>
                ))}
              </div>

              <div className={styles.mobileSheetGroup}>
                <span className={styles.mobileSheetLabel}>Model</span>
                {USER_SELECTABLE_MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={`${styles.mobileSheetOption} ${selectedModel === model.id ? styles.mobileSheetOptionActive : ""}`}
                    onClick={() => {
                      onModelChange(model.id);
                      setMobileOptionsOpen(false);
                    }}
                  >
                    <span className="material-icons-round" aria-hidden="true">{model.icon}</span>
                    <span>{model.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.mobileHeaderActions}>
          <button
            type="button"
            className={styles.mobileIconButton}
            aria-label="New chat"
            onClick={onNewChat}
          >
            <span className="material-icons-round">edit</span>
          </button>

          {hasMobileMoreActions ? (
            <div className={styles.mobileMoreAnchor} ref={mobileMoreRef}>
              <button
                type="button"
                className={styles.mobileIconButton}
                aria-label="More chat actions"
                aria-expanded={isMobileMoreOpen}
                onClick={() => {
                  setMobileMoreOpen((prev) => !prev);
                  setMobileOptionsOpen(false);
                }}
              >
                <span className="material-icons-round">more_horiz</span>
              </button>

              {isMobileMoreOpen ? (
                <div className={styles.mobileMoreMenu}>
                  {returnProject ? (
                    <Link
                      href={returnProject.href}
                      className={styles.mobileMoreItem}
                      onClick={() => setMobileMoreOpen(false)}
                    >
                      <span className="material-icons-round" aria-hidden="true">folder_open</span>
                      <span>Back to {returnProject.name}</span>
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={styles.mobileMoreItem}
                    onClick={() => {
                      onExportMarkdown();
                      setMobileMoreOpen(false);
                    }}
                  >
                    <span className="material-icons-round" aria-hidden="true">download</span>
                    Export Markdown
                  </button>
                  <button
                    type="button"
                    className={styles.mobileMoreItem}
                    onClick={() => {
                      onExportPdf();
                      setMobileMoreOpen(false);
                    }}
                  >
                    <span className="material-icons-round" aria-hidden="true">picture_as_pdf</span>
                    Export PDF
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <span className="sr-only">
          Current scope: {selectedScopeLabel}. Current model: {selectedModelInfo?.name ?? selectedModel}.
        </span>
      </div>
    );
  }

  return (
    <div className={styles.chatHeader}>
      <div className={styles.projectSelector} ref={projectDropdownRef}>
        <button
          type="button"
          className={styles.projectButton}
          onClick={() => setProjectDropdownOpen((prev) => !prev)}
          aria-expanded={isProjectDropdownOpen}
        >
          <span className="material-icons-round">{projectIcon}</span>
          <span>{selectedScopeLabel}</span>
          <span className="material-icons-round">expand_more</span>
        </button>

        {isProjectDropdownOpen ? (
          <div className={styles.projectDropdown}>
            <button
              className={`${styles.projectOption} ${!selectedProjectId ? styles.projectOptionActive : ""}`}
              onClick={() => {
                onSelectProject(null);
                setProjectDropdownOpen(false);
              }}
            >
              Global
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                className={`${styles.projectOption} ${selectedProjectId === project.id ? styles.projectOptionActive : ""}`}
                onClick={() => {
                  onSelectProject(project.id);
                  setProjectDropdownOpen(false);
                }}
              >
                {project.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.headerActions}>
        {returnProject ? (
          <Link
            href={returnProject.href}
            className={styles.returnProjectLink}
            aria-label={`Back to ${returnProject.name}`}
          >
            <span className="material-icons-round" aria-hidden="true">folder_open</span>
            <span className={styles.returnProjectText}>
              <span className={styles.returnProjectKicker}>Back to</span>
              <span className={styles.returnProjectName}>{returnProject.name}</span>
            </span>
          </Link>
        ) : null}

        {showReasoningControls ? (
          <AIChatReasoningModeDropdown
            reasoningMode={reasoningMode}
            onReasoningModeChange={onReasoningModeChange}
            reasoningSupport={reasoningSupport}
          >
            <button
              type="button"
              className={styles.reasoningModeBtn}
              data-state={reasoningMode}
              aria-label={`Reasoning visibility: ${reasoningMode}`}
              title={`Reasoning visibility: ${reasoningMode}`}
            >
              <span className="material-icons-round">psychology</span>
              <span className={styles.reasoningModeLabel}>
                {reasoningMode === "off" ? "Off" : reasoningMode === "summary" ? "Summary" : "Full"}
              </span>
              <span className="material-icons-round">expand_more</span>
            </button>
          </AIChatReasoningModeDropdown>
        ) : null}

        <button
          type="button"
          className={styles.exportBtn}
          onClick={onExportMarkdown}
          disabled={activeExportDisabled}
        >
          <span className="material-icons-round">download</span>
          Export MD
        </button>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={onExportPdf}
          disabled={activeExportDisabled}
        >
          <span className="material-icons-round">picture_as_pdf</span>
          Export PDF
        </button>
      </div>
    </div>
  );
}
