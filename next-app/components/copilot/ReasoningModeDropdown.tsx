"use client";

import type { ReactElement } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReasoningMode } from "@/types/ai";
import { REASONING_MODE_OPTIONS } from "@/lib/ai/reasoning-visibility";
import styles from "./ReasoningModeDropdown.module.css";

type ReasoningModeDropdownProps = {
  reasoningMode: ReasoningMode;
  onReasoningModeChange: (mode: ReasoningMode) => void;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
};

export function ReasoningModeDropdown({
  reasoningMode,
  onReasoningModeChange,
  children,
  side = "bottom",
  align = "end",
  sideOffset = 6,
}: ReasoningModeDropdownProps) {
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
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
