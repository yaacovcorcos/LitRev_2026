"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import styles from "./ledger.module.css";
import { useLedger } from "@/contexts/LedgerContext";

export default function LedgerPage() {
    const { id } = useParams<{ id: string }>();
    const { getProjectById } = useProjects();
    const { getStudiesByProject, updateStudies } = useLedger();
    const project = id ? getProjectById(id) : undefined;
    const studies = id ? getStudiesByProject(id) : [];
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const allSelected = studies.length > 0 && selectedIds.length === studies.length;
    const hasSelection = selectedIds.length > 0;
    const selectAllRef = useRef<HTMLInputElement | null>(null);

    if (!project) {
        return (
            <AppShell activeNav="projects">
                <div className={styles.notFound}>
                    <h1>Project not found</h1>
                    <Link href="/" className="btn-minimal" style={{ width: "auto", padding: "12px 24px" }}>
                        Back to Dashboard
                    </Link>
                </div>
            </AppShell>
        );
    }

    const extractedCount = studies.filter((s) => s.status === "extracted").length;

    useEffect(() => {
        if (!selectAllRef.current) return;
        selectAllRef.current.indeterminate = hasSelection && !allSelected;
    }, [hasSelection, allSelected]);

    useEffect(() => {
        setSelectedIds((prev) => {
            const next = prev.filter((studyId) => studies.some((study) => study.id === studyId));
            return next.length === prev.length ? prev : next;
        });
    }, [studies]);

    const toggleStudySelection = (studyId: string) => {
        setSelectedIds((prev) => (
            prev.includes(studyId) ? prev.filter((id) => id !== studyId) : [...prev, studyId]
        ));
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds([]);
            return;
        }
        setSelectedIds(studies.map((study) => study.id));
    };

    const handleDeleteStudy = (studyId: string) => {
        if (!id) return;
        const confirmed = window.confirm("Delete this study from the evidence ledger?");
        if (!confirmed) return;
        updateStudies(id, studies.filter((study) => study.id !== studyId));
    };

    const handleBulkDelete = () => {
        if (!id || !hasSelection) return;
        const confirmed = window.confirm(`Delete ${selectedIds.length} selected studies?`);
        if (!confirmed) return;
        updateStudies(id, studies.filter((study) => !selectedSet.has(study.id)));
        setSelectedIds([]);
    };

    return (
        <AppShell activeNav="projects">
            <div className={styles.layout}>
                <header className={styles.header}>
                    <div className={styles.headerText}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                            <BaseBackButton href={`/project/${project.id}`} />
                            <span className={styles.eyebrow}>Evidence Ledger</span>
                        </div>
                        <h1>{project.name}</h1>
                    </div>
                    <div className={styles.headerActions}>
                        {hasSelection ? (
                            <button className="header-btn header-btn-danger" onClick={handleBulkDelete}>
                                <span className="material-icons-round">delete</span>
                                Delete {selectedIds.length} Selected
                            </button>
                        ) : null}
                        <button className="header-btn">
                            <span className="material-icons-round">upload_file</span>
                            Import Studies
                        </button>
                    </div>
                </header>

                <div className={styles.statsRow}>
                    <div className={styles.statChip}>
                        <span className="material-icons-round">description</span>
                        <span>{studies.length} total studies</span>
                    </div>
                    <div className={styles.statChip}>
                        <span className="material-icons-round">check_circle</span>
                        <span>{extractedCount} extracted</span>
                    </div>
                    <div className={styles.statChip}>
                        <span className="material-icons-round">pending</span>
                        <span>{studies.length - extractedCount} pending</span>
                    </div>
                    {hasSelection ? (
                        <div className={styles.statChip}>
                            <span className="material-icons-round">checklist</span>
                            <span>{selectedIds.length} selected</span>
                        </div>
                    ) : null}
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.ledgerTable}>
                        <thead>
                            <tr>
                                <th className={styles.selectCell}>
                                    <input
                                        ref={selectAllRef}
                                        className={styles.selectCheckbox}
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={toggleSelectAll}
                                        aria-label={allSelected ? "Deselect all studies" : "Select all studies"}
                                    />
                                </th>
                                <th>Study</th>
                                <th>Authors</th>
                                <th>Year</th>
                                <th>Status</th>
                                <th>Quality</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {studies.map((study) => (
                                <tr key={study.id} className={selectedSet.has(study.id) ? styles.rowSelected : undefined}>
                                    <td className={styles.selectCell}>
                                        <input
                                            className={styles.selectCheckbox}
                                            type="checkbox"
                                            checked={selectedSet.has(study.id)}
                                            onChange={() => toggleStudySelection(study.id)}
                                            aria-label={`Select ${study.title}`}
                                        />
                                    </td>
                                    <td className={styles.titleCell}>{study.title}</td>
                                    <td>{study.authors}</td>
                                    <td>{study.year}</td>
                                    <td>
                                        <span className={`${styles.statusPill} ${study.status === "extracted" ? styles.statusExtracted : styles.statusPending}`}>
                                            {study.status === "extracted" ? "Extracted" : "Pending"}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.qualityBadge} ${study.quality === "High" ? styles.qualityHigh : study.quality === "Medium" ? styles.qualityMedium : ""}`}>
                                            {study.quality}
                                        </span>
                                    </td>
                                    <td>
                                        <button className={styles.actionBtn} title="Open Study">
                                            <span className="material-icons-round">open_in_new</span>
                                        </button>
                                        <button className={styles.actionBtn} title="Extract Data">
                                            <span className="material-icons-round">edit_note</span>
                                        </button>
                                        <button
                                            className={styles.actionBtn}
                                            title="Delete Study"
                                            aria-label={`Delete ${study.title}`}
                                            onClick={() => handleDeleteStudy(study.id)}
                                        >
                                            <span className="material-icons-round">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </AppShell>
    );
}
