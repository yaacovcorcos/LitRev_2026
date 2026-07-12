"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { DeliveryMode, ReasoningEffort, ReasoningMode } from "@/types/ai";
import {
  USER_SELECTABLE_MODELS,
  type ReasoningVisibilitySupport,
  type SelectableModelId,
} from "@/lib/ai/config";
import { REASONING_MODE_OPTIONS } from "@/lib/ai/reasoning-visibility";
import type {
  ModelAvailabilityMap,
  ModelAvailabilityStatus,
} from "@/hooks/useModelAvailability";
import {
  ChatDeliveryModeControl,
  ChatModelSelector,
  ChatReasoningEffortSelector,
} from "@/components/chat/ChatModelSettings";
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
  modelAvailability?: ModelAvailabilityMap;
  modelAvailabilityStatus?: ModelAvailabilityStatus;
  onRetryModelAvailability?: () => void;
  reasoningEffort: ReasoningEffort;
  deliveryMode: DeliveryMode;
  showReasoningControls: boolean;
  reasoningMode: ReasoningMode;
  reasoningVisibilitySupport: ReasoningVisibilitySupport;
  onHistoryToggle: () => void;
  onNewChat: () => void;
  onSelectProject: (projectId: string | null) => void;
  onModelChange: (modelId: SelectableModelId) => void;
  onReasoningEffortChange: (effort: ReasoningEffort) => void;
  onDeliveryModeChange: (mode: DeliveryMode) => void;
  onReasoningModeChange: (mode: ReasoningMode) => void;
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
  modelAvailability,
  modelAvailabilityStatus,
  onRetryModelAvailability,
  reasoningEffort,
  deliveryMode,
  showReasoningControls,
  reasoningMode,
  reasoningVisibilitySupport,
  onHistoryToggle,
  onNewChat,
  onSelectProject,
  onModelChange,
  onReasoningEffortChange,
  onDeliveryModeChange,
  onReasoningModeChange,
}: AIChatHeaderProps) {
  const [isProjectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isMobileOptionsOpen, setMobileOptionsOpen] = useState(false);
  const [isMobileMoreOpen, setMobileMoreOpen] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);
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
    if (!isMobileMoreOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(target)) {
        setMobileMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isMobileMoreOpen]);

  const hasMobileMoreActions = Boolean(returnProject);
  const projectIcon = selectedProjectId ? "folder" : "public";
  const selectedModelInfo = USER_SELECTABLE_MODELS.find((model) => model.id === selectedModel);
  const reasoningModeOptions = reasoningVisibilitySupport === "summary"
    ? REASONING_MODE_OPTIONS.filter((option) => option.value !== "full")
    : REASONING_MODE_OPTIONS;

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

        <Dialog.Root
          open={isMobileOptionsOpen}
          onOpenChange={(open) => {
            setMobileOptionsOpen(open);
            if (open) setMobileMoreOpen(false);
          }}
        >
          <div className={styles.mobileOptionsAnchor}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className={styles.mobileTitlePill}
                aria-label="Open AI options"
              >
                <span>LitRev AI</span>
                <span className="material-icons-round" aria-hidden="true">expand_more</span>
              </button>
            </Dialog.Trigger>
          </div>

          <Dialog.Portal>
            <Dialog.Overlay className={styles.mobileOptionsOverlay} />
            <Dialog.Content className={styles.mobileOptionsDialog}>
              <div className={styles.mobileSheetHeader}>
                <div>
                  <Dialog.Title className={styles.mobileSheetTitle}>AI options</Dialog.Title>
                  <Dialog.Description className={styles.mobileSheetDescription}>
                    {showReasoningControls
                      ? "Choose scope, model, reasoning effort, reasoning visibility and delivery speed."
                      : "Choose scope, model, reasoning effort and delivery speed."}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button type="button" className={styles.mobileSheetClose} aria-label="Close AI options">
                    <span className="material-icons-round" aria-hidden="true">close</span>
                  </button>
                </Dialog.Close>
              </div>

              <div className={styles.mobileSheetScroll}>
                <div className={styles.mobileSheetGroup}>
                  <span className={styles.mobileSheetLabel}>Scope</span>
                  <div role="radiogroup" aria-label="Research scope">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={!selectedProjectId}
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
                        role="radio"
                        aria-checked={selectedProjectId === project.id}
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
                </div>

                <div className={styles.mobileSheetGroup}>
                  <span className={styles.mobileSheetLabel}>Model</span>
                  <ChatModelSelector
                    selectedModel={selectedModel}
                    onModelChange={onModelChange}
                    availability={modelAvailability}
                    availabilityStatus={modelAvailabilityStatus}
                    onRetryAvailability={onRetryModelAvailability}
                    presentation="inline"
                  />
                </div>

                <div className={styles.mobileSheetGroup}>
                  <span className={styles.mobileSheetLabel}>Reasoning effort</span>
                  <ChatReasoningEffortSelector
                    selectedModel={selectedModel}
                    reasoningEffort={reasoningEffort}
                    onReasoningEffortChange={onReasoningEffortChange}
                    presentation="inline"
                  />
                </div>

                {showReasoningControls ? (
                  <div className={styles.mobileSheetGroup}>
                    <span className={styles.mobileSheetLabel}>Reasoning visibility</span>
                    <div role="radiogroup" aria-label="Reasoning visibility">
                      {reasoningModeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="radio"
                          aria-checked={reasoningMode === option.value}
                          className={`${styles.mobileReasoningOption} ${reasoningMode === option.value ? styles.mobileSheetOptionActive : ""}`}
                          onClick={() => onReasoningModeChange(option.value)}
                        >
                          <span className={styles.mobileReasoningCopy}>
                            <span>{option.label}</span>
                            <span>{option.description}</span>
                          </span>
                          {reasoningMode === option.value ? (
                            <span className="material-icons-round" aria-hidden="true">check</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className={styles.mobileSheetGroup}>
                  <span className={styles.mobileSheetLabel}>Delivery</span>
                  <ChatDeliveryModeControl
                    selectedModel={selectedModel}
                    deliveryMode={deliveryMode}
                    onDeliveryModeChange={onDeliveryModeChange}
                    presentation="inline"
                  />
                  {selectedModelInfo?.deliveryModes.includes("priority") ? null : (
                    <p className={styles.mobileDeliveryUnavailable}>
                      Faster delivery is not available for this model.
                    </p>
                  )}
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

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
            reasoningVisibilitySupport={reasoningVisibilitySupport}
          >
            <button
              type="button"
              className={styles.reasoningModeBtn}
              data-state={reasoningMode}
              aria-label={`Reasoning visibility: ${reasoningMode}`}
              title={`Reasoning visibility: ${reasoningMode}`}
            >
              <span className="material-icons-round">psychology</span>
              <span className={styles.reasoningModeLabel}>Reasoning</span>
              <span className="material-icons-round">expand_more</span>
            </button>
          </AIChatReasoningModeDropdown>
        ) : null}


      </div>
    </div>
  );
}
