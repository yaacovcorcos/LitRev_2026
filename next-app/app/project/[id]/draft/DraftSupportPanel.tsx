"use client";

import type { Study } from "@/types/ledger";
import { DraftContextRail } from "./DraftContextRail";
import { DraftSidebar } from "./DraftSidebar";

export type DraftSupportPanelMode = "evidence" | "assets" | "pages" | "review";

type DraftSupportPanelProps = {
  collapsed: boolean;
  isOverlay?: boolean;
  activeMode?: DraftSupportPanelMode;
  availableModes?: DraftSupportPanelMode[];
  activeSectionLabel: string;
  isReferencesSection: boolean;
  usedEvidence: Study[];
  onAddEvidence: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onInsertCitation: (study: Study) => void;
  onRemoveEvidence: (studyId: string) => void;
  studyLabel: (study: Study) => string;
};

export function DraftSupportPanel({
  collapsed,
  isOverlay = false,
  activeMode = "evidence",
  availableModes = ["evidence"],
  activeSectionLabel,
  isReferencesSection,
  usedEvidence,
  onAddEvidence,
  onCollapse,
  onExpand,
  onInsertCitation,
  onRemoveEvidence,
  studyLabel,
}: DraftSupportPanelProps) {
  // Keep the future context-panel ownership explicit without surfacing new UI yet.
  const mode = availableModes.includes(activeMode) ? activeMode : "evidence";

  return (
    <DraftSidebar
      collapsed={collapsed}
      isOverlay={isOverlay}
      onToggleCollapsed={collapsed ? onExpand : onCollapse}
      onDismiss={onCollapse}
    >
      {mode === "evidence" ? (
        <DraftContextRail
          activeSectionLabel={activeSectionLabel}
          isReferencesSection={isReferencesSection}
          usedEvidence={usedEvidence}
          onAddEvidence={onAddEvidence}
          onCollapse={onCollapse}
          onInsertCitation={(studyId) => {
            const study = usedEvidence.find((entry) => entry.id === studyId);
            if (!study) return;
            onInsertCitation(study);
          }}
          onRemoveEvidence={onRemoveEvidence}
          studyLabel={studyLabel}
        />
      ) : null}
    </DraftSidebar>
  );
}
