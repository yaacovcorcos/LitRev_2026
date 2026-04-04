"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReasoningMode } from "@/types/ai";
import type { ReasoningSupportTier } from "@/lib/ai/config";
import styles from "./ai-view.module.css";

const AiChatReasoningModeDropdown = dynamic(() =>
  import("@/components/chat/ChatReasoningModeDropdown").then((module) => module.ChatReasoningModeDropdown)
);

type ProjectOption = {
  id: string;
  name: string;
};

type AiChatHeaderProps = {
  mobileAiV2Enabled: boolean;
  isPhoneViewport: boolean;
  isHistoryCollapsed: boolean;
  historyContentId: string;
  selectedProjectId: string | null;
  selectedScopeLabel: string;
  projects: ProjectOption[];
  showReasoningControls: boolean;
  reasoningMode: ReasoningMode;
  reasoningSupport: ReasoningSupportTier;
  activeTimelineLength: number;
  onHistoryToggle: () => void;
  onSelectProject: (projectId: string | null) => void;
  onReasoningModeChange: (mode: ReasoningMode) => void;
  onExportMarkdown: () => void;
  onExportPdf: () => void;
};

export function AiChatHeader({
  mobileAiV2Enabled,
  isPhoneViewport,
  isHistoryCollapsed,
  historyContentId,
  selectedProjectId,
  selectedScopeLabel,
  projects,
  showReasoningControls,
  reasoningMode,
  reasoningSupport,
  activeTimelineLength,
  onHistoryToggle,
  onSelectProject,
  onReasoningModeChange,
  onExportMarkdown,
  onExportPdf,
}: AiChatHeaderProps) {
  const [isProjectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);

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

  const activeExportDisabled = activeTimelineLength === 0;
  const projectIcon = useMemo(() => (selectedProjectId ? "folder" : "public"), [selectedProjectId]);

  return (
    <div className={styles.chatHeader}>
      {mobileAiV2Enabled && isPhoneViewport ? (
        <button
          type="button"
          className={styles.mobileHistoryToggle}
          aria-label={isHistoryCollapsed ? "Open chat history" : "Close chat history"}
          aria-expanded={!isHistoryCollapsed}
          aria-controls={historyContentId}
          onClick={onHistoryToggle}
        >
          <span className="material-icons-round">menu</span>
          <span className={styles.mobileHistoryLabel}>Chats</span>
        </button>
      ) : null}

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
        {showReasoningControls ? (
          <AiChatReasoningModeDropdown
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
          </AiChatReasoningModeDropdown>
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
