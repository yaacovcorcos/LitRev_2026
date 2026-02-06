"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SortMode, ViewMode } from "@/types/view";
import styles from "@/components/ControlsBar.module.css";

const SORT_OPTIONS: SortMode[] = ["modified", "name", "created"];

type ControlsBarProps = {
  sortMode: SortMode;
  viewMode: ViewMode;
  onSortChange: (mode: SortMode) => void;
  onViewChange: (mode: ViewMode) => void;
};

export function ControlsBar({ sortMode, viewMode, onSortChange, onViewChange }: ControlsBarProps) {
  const [isSortOpen, setSortOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!isSortOpen) return;

    const handleClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setSortOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isSortOpen]);

  // Focus the active option when dropdown opens
  useEffect(() => {
    if (isSortOpen) {
      const activeIndex = SORT_OPTIONS.indexOf(sortMode);
      setFocusedIndex(activeIndex >= 0 ? activeIndex : 0);
      optionRefs.current[activeIndex >= 0 ? activeIndex : 0]?.focus();
    }
  }, [isSortOpen, sortMode]);

  const selectSort = (mode: SortMode) => {
    onSortChange(mode);
    setSortOpen(false);
  };

  const handleListboxKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          const next = (focusedIndex + 1) % SORT_OPTIONS.length;
          setFocusedIndex(next);
          optionRefs.current[next]?.focus();
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          const prev = (focusedIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length;
          setFocusedIndex(prev);
          optionRefs.current[prev]?.focus();
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedIndex(0);
          optionRefs.current[0]?.focus();
          break;
        }
        case "End": {
          e.preventDefault();
          const last = SORT_OPTIONS.length - 1;
          setFocusedIndex(last);
          optionRefs.current[last]?.focus();
          break;
        }
        case "Escape": {
          e.preventDefault();
          setSortOpen(false);
          break;
        }
        case "Enter":
        case " ": {
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < SORT_OPTIONS.length) {
            selectSort(SORT_OPTIONS[focusedIndex]);
          }
          break;
        }
      }
    },
    [focusedIndex, selectSort]
  );

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
            aria-activedescendant={focusedIndex >= 0 ? `sort-${SORT_OPTIONS[focusedIndex]}` : undefined}
            onKeyDown={handleListboxKeyDown}
          >
            <button
              type="button"
              ref={(el) => { optionRefs.current[0] = el; }}
              id="sort-modified"
              className={`${styles.option} ${sortMode === "modified" ? styles.selected : ""}`}
              data-value="modified"
              role="option"
              aria-selected={sortMode === "modified"}
              tabIndex={focusedIndex === 0 ? 0 : -1}
              onClick={() => selectSort("modified")}
            >
              Recently Modified
            </button>
            <button
              type="button"
              ref={(el) => { optionRefs.current[1] = el; }}
              id="sort-name"
              className={`${styles.option} ${sortMode === "name" ? styles.selected : ""}`}
              data-value="name"
              role="option"
              aria-selected={sortMode === "name"}
              tabIndex={focusedIndex === 1 ? 0 : -1}
              onClick={() => selectSort("name")}
            >
              Name
            </button>
            <button
              type="button"
              ref={(el) => { optionRefs.current[2] = el; }}
              id="sort-created"
              className={`${styles.option} ${sortMode === "created" ? styles.selected : ""}`}
              data-value="created"
              role="option"
              aria-selected={sortMode === "created"}
              tabIndex={focusedIndex === 2 ? 0 : -1}
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
