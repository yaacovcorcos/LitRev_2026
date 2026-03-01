"use client";

import type { ReactElement } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReasoningMode } from "@/types/ai";
import type { ReasoningSupportTier } from "@/lib/ai/config";
import { REASONING_MODE_OPTIONS } from "@/lib/ai/reasoning-visibility";
import styles from "./ReasoningModeDropdown.module.css";

type ReasoningModeDropdownProps = {
  reasoningMode: ReasoningMode;
  onReasoningModeChange: (mode: ReasoningMode) => void;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /**
   * Reasoning support tier of the current model.
   * - "explicit": Full reasoning controls
   * - "best_effort": Controls + warning note
   * - "none": Dropdown is hidden (caller should not render)
   */
  reasoningSupport?: ReasoningSupportTier;
};

export function ReasoningModeDropdown({
  reasoningMode,
  onReasoningModeChange,
  children,
  side = "bottom",
  align = "end",
  sideOffset = 6,
  reasoningSupport = "explicit",
}: ReasoningModeDropdownProps) {
  const showBestEffortNote = reasoningSupport === "best_effort";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {children}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.dropdown}
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <div className={styles.label}>Reasoning visibility</div>
          <DropdownMenu.RadioGroup
            value={reasoningMode}
            onValueChange={(value) => onReasoningModeChange(value as ReasoningMode)}
          >
            {REASONING_MODE_OPTIONS.map((option) => (
              <DropdownMenu.RadioItem
                key={option.value}
                value={option.value}
                className={styles.item}
                data-active={reasoningMode === option.value}
              >
                <span className={styles.itemName}>
                  <span className={styles.itemDot}>
                    {reasoningMode === option.value ? "●" : "○"}
                  </span>
                  {option.label}
                </span>
                <span className={styles.itemDesc}>{option.description}</span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          {showBestEffortNote && (
            <div className={styles.bestEffortNote}>
              <span className="material-icons-round">info</span>
              <span>This model may not always return reasoning.</span>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
