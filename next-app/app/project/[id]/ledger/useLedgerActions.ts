"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { Study, StudyDetails, TriageDecision } from "@/types/ledger";

export type LedgerConfirmDialogState = {
  message: string;
  onConfirm: () => void;
} | null;

type NewStudyForm = {
  title: string;
  authors: string;
  year: string;
  status: Study["status"];
  quality: Study["quality"];
};

type UseLedgerActionsArgs = {
  projectId: string | undefined;
  studies: Study[];
  removeStudies: (projectId: string, studyIds: string[]) => Promise<void>;
  upsertNewStudy: (projectId: string, study: Study) => Promise<Study>;
  updateSingleStudy: (
    projectId: string,
    studyId: string,
    updates: { details?: StudyDetails },
  ) => Promise<Study>;
  setAlertMsg: Dispatch<SetStateAction<string | null>>;
  setConfirmDialog: Dispatch<SetStateAction<LedgerConfirmDialogState>>;
};

type UseLedgerActionsResult = {
  allSelected: boolean;
  expandedIds: Set<string>;
  hasSelection: boolean;
  isAdding: boolean;
  isSelectMode: boolean;
  newStudy: NewStudyForm;
  selectedSet: Set<string>;
  selectAllRef: MutableRefObject<HTMLInputElement | null>;
  validSelectedIds: string[];
  handleAddStudy: () => Promise<void>;
  handleBulkDelete: () => void;
  handleDeleteStudy: (studyId: string) => void;
  handleQuickAddStudy: () => Promise<void>;
  handleTriage: (studyId: string, decision: TriageDecision) => Promise<void>;
  resetNewStudy: () => void;
  setIsAdding: Dispatch<SetStateAction<boolean>>;
  setNewStudy: Dispatch<SetStateAction<NewStudyForm>>;
  toggleExpand: (studyId: string) => void;
  toggleSelectAll: () => void;
  toggleSelectMode: () => void;
  toggleStudySelection: (studyId: string) => void;
};

const createDefaultNewStudy = (): NewStudyForm => ({
  title: "",
  authors: "",
  year: new Date().getFullYear().toString(),
  status: "pending",
  quality: "-",
});

const createStudyId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `study-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function useLedgerActions({
  projectId,
  studies,
  removeStudies,
  setAlertMsg,
  setConfirmDialog,
  updateSingleStudy,
  upsertNewStudy,
}: UseLedgerActionsArgs): UseLedgerActionsResult {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newStudy, setNewStudy] = useState<NewStudyForm>(createDefaultNewStudy);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const studyIds = useMemo(
    () => new Set(studies.map((study) => study.id)),
    [studies],
  );

  const validSelectedIds = useMemo(
    () => selectedIds.filter((studyId) => studyIds.has(studyId)),
    [selectedIds, studyIds],
  );

  const selectedSet = useMemo(
    () => new Set(validSelectedIds),
    [validSelectedIds],
  );
  const allSelected =
    studies.length > 0 && validSelectedIds.length === studies.length;
  const hasSelection = validSelectedIds.length > 0;

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate = hasSelection && !allSelected;
  }, [allSelected, hasSelection]);

  const resetNewStudy = useCallback(() => {
    setNewStudy(createDefaultNewStudy());
  }, []);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((current) => {
      if (current) setSelectedIds([]);
      return !current;
    });
  }, []);

  const toggleStudySelection = useCallback((studyId: string) => {
    setSelectedIds((current) =>
      current.includes(studyId)
        ? current.filter((selectedId) => selectedId !== studyId)
        : [...current, studyId],
    );
  }, []);

  const toggleExpand = useCallback((studyId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(studyId)) {
        next.delete(studyId);
      } else {
        next.add(studyId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(studies.map((study) => study.id));
  }, [allSelected, studies]);

  const handleDeleteStudy = useCallback(
    (studyId: string) => {
      if (!projectId) return;

      setConfirmDialog({
        message: "Delete this study from the evidence ledger?",
        onConfirm: () => {
          setConfirmDialog(null);
          removeStudies(projectId, [studyId]).catch(() => {
            setAlertMsg("Failed to delete study. Please try again.");
          });
        },
      });
    },
    [projectId, removeStudies, setAlertMsg, setConfirmDialog],
  );

  const handleBulkDelete = useCallback(() => {
    if (!projectId || !hasSelection) return;

    setConfirmDialog({
      message: `Delete ${validSelectedIds.length} selected studies?`,
      onConfirm: () => {
        const idsToDelete = [...validSelectedIds];
        setSelectedIds([]);
        setConfirmDialog(null);
        removeStudies(projectId, idsToDelete).catch(() => {
          setAlertMsg("Failed to delete studies. Please try again.");
        });
      },
    });
  }, [
    hasSelection,
    projectId,
    removeStudies,
    setAlertMsg,
    setConfirmDialog,
    validSelectedIds,
  ]);

  const handleAddStudy = useCallback(async () => {
    if (!projectId) return;

    const title = newStudy.title.trim() || "Untitled Study";
    const authors = newStudy.authors.trim() || "Unknown";
    const parsedYear = Number.parseInt(newStudy.year, 10);
    const safeYear = Number.isFinite(parsedYear)
      ? parsedYear
      : new Date().getFullYear();

    const study: Study = {
      id: createStudyId(),
      title,
      authors,
      year: safeYear,
      status: newStudy.status,
      quality: newStudy.quality,
    };

    try {
      await upsertNewStudy(projectId, study);
      setIsAdding(false);
      resetNewStudy();
    } catch (error) {
      setAlertMsg(
        error instanceof Error ? error.message : "Failed to add study",
      );
    }
  }, [newStudy, projectId, resetNewStudy, setAlertMsg, upsertNewStudy]);

  const handleQuickAddStudy = useCallback(async () => {
    if (!projectId) return;

    const newEntry: Study = {
      id: createStudyId(),
      title: "New Study",
      authors: "",
      year: new Date().getFullYear(),
      status: "pending",
      quality: "-",
    };

    try {
      await upsertNewStudy(projectId, newEntry);
    } catch (error) {
      setAlertMsg(
        error instanceof Error ? error.message : "Failed to add study",
      );
    }
  }, [projectId, setAlertMsg, upsertNewStudy]);

  const handleTriage = useCallback(
    async (studyId: string, decision: TriageDecision) => {
      if (!projectId) return;

      try {
        const currentDetails = studies.find(
          (study) => study.id === studyId,
        )?.details;
        await updateSingleStudy(projectId, studyId, {
          details: {
            ...currentDetails,
            triageDecision: decision,
            triageDate: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("Failed to update triage decision", error);
      }
    },
    [projectId, studies, updateSingleStudy],
  );

  return {
    allSelected,
    expandedIds,
    hasSelection,
    isAdding,
    isSelectMode,
    newStudy,
    selectedSet,
    selectAllRef,
    validSelectedIds,
    handleAddStudy,
    handleBulkDelete,
    handleDeleteStudy,
    handleQuickAddStudy,
    handleTriage,
    resetNewStudy,
    setIsAdding,
    setNewStudy,
    toggleExpand,
    toggleSelectAll,
    toggleSelectMode,
    toggleStudySelection,
  };
}
