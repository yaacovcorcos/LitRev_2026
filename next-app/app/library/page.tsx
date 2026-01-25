"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import controlsStyles from "@/components/ControlsBar.module.css";
import cardStyles from "@/components/ProjectGrid.module.css";
import layoutStyles from "../home.module.css";

type LibraryItem = {
  id: string;
  title: string;
  type: string;
  updatedAt: string; // ISO string
  summary: string;
};

const libraryItems: LibraryItem[] = [
  {
    id: "l1",
    title: "Neural Radiology Review",
    type: "PDF",
    updatedAt: "2025-11-25T09:00:00Z",
    summary: "Key findings from 45 neural imaging trials.",
  },
  {
    id: "l2",
    title: "Urban Planning Meta Study",
    type: "Notes",
    updatedAt: "2025-11-22T12:00:00Z",
    summary: "Comparative matrix of 18 adaptation strategies.",
  },
  {
    id: "l3",
    title: "CRISPR Neurodegeneration",
    type: "Dataset",
    updatedAt: "2025-11-18T10:00:00Z",
    summary: "Raw dataset from CRISPR trials (2019-2024).",
  },
  {
    id: "l4",
    title: "Remote Work Productivity",
    type: "PDF",
    updatedAt: "2025-11-12T14:30:00Z",
    summary: "Synthesis of 60 company-wide studies.",
  },
];

type SortMode = "recent" | "name";

export default function LibraryView() {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [isSortOpen, setSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSortOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isSortOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? libraryItems.filter((item) => item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q))
      : libraryItems;
    return [...base].sort((a, b) => {
      if (sortMode === "name") {
        return a.title.localeCompare(b.title);
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [query, sortMode]);

  return (
    <AppShell activeNav="library">
      <div className={layoutStyles.page}>
        <div className={layoutStyles.headerArea}>
          <TopBar title="Library" subtitle="Recent resources across projects" />

          <div className={controlsStyles.controlsBar}>
            <div className={controlsStyles.searchWrapper}>
              <span className={`material-icons-round ${controlsStyles.searchIcon}`}>search</span>
              <input
                type="text"
                placeholder="Search papers, notes, or datasets..."
                className={controlsStyles.searchInput}
                aria-label="Search library"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className={controlsStyles.viewControls}>
              <div className={controlsStyles.customSelect} ref={sortRef}>
                <button
                  className={controlsStyles.sortButton}
                  id="librarySortBtn"
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isSortOpen}
                  aria-controls="librarySortOptions"
                  onClick={() => setSortOpen((prev) => !prev)}
                >
                  <span className="material-icons-round">sort</span>
                  Sort
                </button>
                <div
                  id="librarySortOptions"
                  className={`${controlsStyles.options} ${isSortOpen ? controlsStyles.optionsOpen : ""}`}
                  role="listbox"
                >
                  <button
                    type="button"
                    className={`${controlsStyles.option} ${sortMode === "recent" ? controlsStyles.selected : ""}`}
                    role="option"
                    aria-selected={sortMode === "recent"}
                    onClick={() => {
                      setSortMode("recent");
                      setSortOpen(false);
                    }}
                  >
                    Recently Updated
                  </button>
                  <button
                    type="button"
                    className={`${controlsStyles.option} ${sortMode === "name" ? controlsStyles.selected : ""}`}
                    role="option"
                    aria-selected={sortMode === "name"}
                    onClick={() => {
                      setSortMode("name");
                      setSortOpen(false);
                    }}
                  >
                    Name A-Z
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={layoutStyles.scrollArea}>
          {filtered.length === 0 ? (
            <div className="empty-state-large">
              <div className="icon-circle-large">
                <span className="material-icons-round">search_off</span>
              </div>
              <h2>No resources found</h2>
              <p>Try adjusting your search terms or reset the filters to browse the full library.</p>
            </div>
          ) : (
            <div className={cardStyles.projectGrid}>
              {filtered.map((item) => {
                const updatedLabel = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
                  new Date(item.updatedAt)
                );
                return (
                  <div key={item.id} className={cardStyles.card}>
                    <div className={`${cardStyles.cardStatus} ${cardStyles.statusReady}`}>{item.type}</div>
                    <h3 className={cardStyles.projectTitle}>{item.title}</h3>
                    <p className={cardStyles.cardSubtitle}>Updated {updatedLabel}</p>
                    <p className={cardStyles.cardDescription}>{item.summary}</p>
                    <button className="btn btn-primary" type="button">
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
