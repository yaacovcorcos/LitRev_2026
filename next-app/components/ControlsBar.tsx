"use client";

import { useEffect, useRef, useState } from "react";
import { SortMode, ViewMode } from "@/types/view";
import styles from "@/components/ControlsBar.module.css";

type ControlsBarProps = {
  sortMode: SortMode;
  viewMode: ViewMode;
  onSortChange: (mode: SortMode) => void;
  onViewChange: (mode: ViewMode) => void;
};

export function ControlsBar({ sortMode, viewMode, onSortChange, onViewChange }: ControlsBarProps) {
  const [isSortOpen, setSortOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSortOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [isSortOpen]);

  const selectSort = (mode: SortMode) => {
    onSortChange(mode);
    setSortOpen(false);
  };

  return (
    <div className={styles.controlsBar}>
      <div className={styles.searchWrapper}>
        <span className={`material-icons-round ${styles.searchIcon}`}>search</span>
        <input
          type="text"
          placeholder="Search projects, papers, or authors..."
          className={styles.searchInput}
          aria-label="Search projects, papers, or authors"
        />
      </div>

      <div className={styles.viewControls}>
        <div className={styles.customSelect} ref={dropdownRef}>
          <button
            type="button"
            className={styles.sortButton}
            id="sortBtn"
            aria-haspopup="listbox"
            aria-expanded={isSortOpen}
            aria-controls="sortOptions"
            onClick={() => setSortOpen((prev) => !prev)}
          >
            <span className="material-icons-round">sort</span>
            Sort by
          </button>
          <div
            className={`${styles.options} ${isSortOpen ? styles.optionsOpen : ""}`}
            id="sortOptions"
            role="listbox"
            aria-activedescendant={`sort-${sortMode}`}
          >
            <button
              type="button"
              id="sort-modified"
              className={`${styles.option} ${sortMode === "modified" ? styles.selected : ""}`}
              data-value="modified"
              role="option"
              aria-selected={sortMode === "modified"}
              onClick={() => selectSort("modified")}
            >
              Recently Modified
            </button>
            <button
              type="button"
              id="sort-name"
              className={`${styles.option} ${sortMode === "name" ? styles.selected : ""}`}
              data-value="name"
              role="option"
              aria-selected={sortMode === "name"}
              onClick={() => selectSort("name")}
            >
              Name
            </button>
            <button
              type="button"
              id="sort-created"
              className={`${styles.option} ${sortMode === "created" ? styles.selected : ""}`}
              data-value="created"
              role="option"
              aria-selected={sortMode === "created"}
              onClick={() => selectSort("created")}
            >
              Date Created
            </button>
          </div>
        </div>

        <div className={styles.viewToggles}>
          <button
            className={`${styles.iconButton} ${viewMode === "grid" ? styles.iconButtonActive : ""}`}
            id="gridViewBtn"
            aria-label="Grid View"
            onClick={() => onViewChange("grid")}
            aria-pressed={viewMode === "grid"}
          >
            <span className="material-icons-round">grid_view</span>
          </button>
          <button
            className={`${styles.iconButton} ${viewMode === "list" ? styles.iconButtonActive : ""}`}
            id="listViewBtn"
            aria-label="List View"
            onClick={() => onViewChange("list")}
            aria-pressed={viewMode === "list"}
          >
            <span className="material-icons-round">view_list</span>
          </button>
        </div>
      </div>
    </div>
  );
}
