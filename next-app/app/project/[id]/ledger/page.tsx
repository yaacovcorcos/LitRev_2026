"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import styles from "./ledger.module.css";

const mockStudies = [
    { id: "s1", title: "Deep Learning in Medical Imaging", authors: "Litjens et al.", year: 2017, status: "extracted", quality: "High" },
    { id: "s2", title: "Radiologist-level Pneumonia Detection", authors: "Rajpurkar et al.", year: 2018, status: "extracted", quality: "High" },
    { id: "s3", title: "AI for Chest X-ray Screening", authors: "Wang et al.", year: 2020, status: "pending", quality: "-" },
    { id: "s4", title: "Transfer Learning in Radiology", authors: "Shin et al.", year: 2016, status: "extracted", quality: "Medium" },
    { id: "s5", title: "Attention Mechanisms for CT Scans", authors: "Chen et al.", year: 2021, status: "pending", quality: "-" },
    { id: "s6", title: "Multi-modal Imaging Analysis", authors: "Kim et al.", year: 2022, status: "pending", quality: "-" },
];

export default function LedgerPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const { getProjectById } = useProjects();
    const project = id ? getProjectById(id) : undefined;

    if (!project) {
        return (
            <AppShell activeNav="projects">
                <div className={styles.notFound}>
                    <h1>Project not found</h1>
                    <Link href="/" className="btn btn-primary" style={{ width: "auto", padding: "12px 24px" }}>
                        Back to Dashboard
                    </Link>
                </div>
            </AppShell>
        );
    }

    const extractedCount = mockStudies.filter((s) => s.status === "extracted").length;

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
                        <button className="header-btn">
                            <span className="material-icons-round">upload_file</span>
                            Import Studies
                        </button>
                    </div>
                </header>

                <div className={styles.statsRow}>
                    <div className={styles.statChip}>
                        <span className="material-icons-round">description</span>
                        <span>{mockStudies.length} total studies</span>
                    </div>
                    <div className={styles.statChip}>
                        <span className="material-icons-round">check_circle</span>
                        <span>{extractedCount} extracted</span>
                    </div>
                    <div className={styles.statChip}>
                        <span className="material-icons-round">pending</span>
                        <span>{mockStudies.length - extractedCount} pending</span>
                    </div>
                </div>

                <div className={styles.tableWrapper}>
                    <table className={styles.ledgerTable}>
                        <thead>
                            <tr>
                                <th>Study</th>
                                <th>Authors</th>
                                <th>Year</th>
                                <th>Status</th>
                                <th>Quality</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mockStudies.map((study) => (
                                <tr key={study.id}>
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
