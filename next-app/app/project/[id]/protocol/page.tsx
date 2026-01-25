"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import styles from "./protocol.module.css";

export default function ProtocolPage() {
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

    return (
        <AppShell activeNav="projects">
            <div className={styles.layout}>
                <header className={styles.header}>
                    <button className={styles.backBtn} onClick={() => router.push(`/project/${id}`)}>
                        <span className="material-icons-round">arrow_back</span>
                        Back to Overview
                    </button>
                    <div className={styles.headerText}>
                        <span className={styles.eyebrow}>Study Protocol</span>
                        <h1>{project.name}</h1>
                    </div>
                </header>

                <div className={styles.content}>
                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className="material-icons-round">target</span>
                            PICO Framework
                        </h2>
                        <div className={styles.picoGrid}>
                            <div className={styles.picoCard}>
                                <span className={styles.picoLabel}>Population</span>
                                <p className={styles.picoValue}>Adults diagnosed with early-stage tumors</p>
                            </div>
                            <div className={styles.picoCard}>
                                <span className={styles.picoLabel}>Intervention</span>
                                <p className={styles.picoValue}>AI-assisted imaging analysis</p>
                            </div>
                            <div className={styles.picoCard}>
                                <span className={styles.picoLabel}>Comparison</span>
                                <p className={styles.picoValue}>Standard radiologist review</p>
                            </div>
                            <div className={styles.picoCard}>
                                <span className={styles.picoLabel}>Outcome</span>
                                <p className={styles.picoValue}>Detection accuracy and time to diagnosis</p>
                            </div>
                        </div>
                    </section>

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className="material-icons-round">checklist</span>
                            Eligibility Criteria
                        </h2>
                        <div className={styles.criteriaLists}>
                            <div className={styles.criteriaGroup}>
                                <h3 className={styles.criteriaHeading}>Inclusion</h3>
                                <ul className={styles.criteriaList}>
                                    <li>Published between 2018-2024</li>
                                    <li>Peer-reviewed journal articles</li>
                                    <li>Reports quantitative outcomes</li>
                                    <li>English language</li>
                                </ul>
                            </div>
                            <div className={styles.criteriaGroup}>
                                <h3 className={styles.criteriaHeading}>Exclusion</h3>
                                <ul className={styles.criteriaList}>
                                    <li>Conference abstracts only</li>
                                    <li>Case reports with n &lt; 10</li>
                                    <li>Non-human subjects</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    <section className={styles.section}>
                        <h2 className={styles.sectionTitle}>
                            <span className="material-icons-round">search</span>
                            Search Strategy
                        </h2>
                        <div className={styles.searchBox}>
                            <code className={styles.searchQuery}>
                                (&quot;deep learning&quot; OR &quot;machine learning&quot; OR &quot;artificial intelligence&quot;) AND
                                (&quot;radiology&quot; OR &quot;imaging&quot; OR &quot;CT&quot; OR &quot;MRI&quot;) AND
                                (&quot;tumor detection&quot; OR &quot;cancer screening&quot;)
                            </code>
                        </div>
                        <div className={styles.databaseList}>
                            <span className={styles.databaseChip}>PubMed</span>
                            <span className={styles.databaseChip}>Embase</span>
                            <span className={styles.databaseChip}>Cochrane Library</span>
                            <span className={styles.databaseChip}>Web of Science</span>
                        </div>
                    </section>
                </div>
            </div>
        </AppShell>
    );
}
