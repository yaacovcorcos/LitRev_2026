"use client";

import type { ReactElement } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReasoningMode } from "@/types/ai";
import type { ReasoningVisibilitySupport } from "@/lib/ai/config";
import { useHydrated } from "@/hooks/useHydrated";
import { REASONING_MODE_OPTIONS } from "@/lib/ai/reasoning-visibility";
import styles from "./ChatReasoningModeDropdown.module.css";

type ChatReasoningModeDropdownProps = {
  reasoningMode: ReasoningMode;
  onReasoningModeChange: (mode: ReasoningMode) => void;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  /**
   * Provider-supported visible reasoning level, independent of compute effort.
   * Callers should not render the dropdown when this is "none".
   */
  reasoningVisibilitySupport?: ReasoningVisibilitySupport;
};

export function ChatReasoningModeDropdown({
  reasoningMode,
  onReasoningModeChange,
  children,
  side = "bottom",
  align = "end",
  sideOffset = 6,
  reasoningVisibilitySupport = "full",
}: ChatReasoningModeDropdownProps) {
  const hasMounted = useHydrated();
  const options = reasoningVisibilitySupport === "summary"
    ? REASONING_MODE_OPTIONS.filter((option) => option.value !== "full")
    : REASONING_MODE_OPTIONS;

  // Match the server tree on the first client render so Radix-generated ids
  // do not drift during hydration in headers that SSR this trigger.
  if (!hasMounted) {
    return children;
  }

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
            {options.map((option) => (
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
          {reasoningVisibilitySupport === "summary" && (
            <div className={styles.bestEffortNote}>
              <span className="material-icons-round">info</span>
              <span>This provider returns a reasoning summary, not raw private reasoning.</span>
            </div>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
