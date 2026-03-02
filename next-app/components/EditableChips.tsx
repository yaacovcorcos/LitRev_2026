"use client";

/**
 * EditableChips - Editable chip/tag list for databases, keywords, etc.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Editable.module.css";

export type EditableChipsProps = {
    /** Chip values */
    items: string[];
    /** Callback to add a new chip */
    onAdd: (value: string) => void;
    /** Callback to remove a chip */
    onRemove: (index: number) => void;
    /** Add button label */
    addLabel?: string;
    /** Placeholder for input */
    placeholder?: string;
    /** Whether the chips are currently active */
    isActive?: boolean;
    /** Callback when chips are focused */
    onFocus?: () => void;
    /** Callback when focus leaves chips */
    onBlur?: () => void;
    /** Additional className for the wrapper */
    className?: string;
    /** aria-label for the list */
    ariaLabel?: string;
    /** Suggested items to show in a dropdown (future enhancement) */
    suggestions?: string[];
};

export function EditableChips({
    items,
    onAdd,
    onRemove,
    addLabel = "Add",
    placeholder = "Type and press Enter...",
    onFocus,
    onBlur,
    className = "",
    ariaLabel,
}: EditableChipsProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newValue, setNewValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Focus input when adding
    useEffect(() => {
        if (isAdding && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isAdding]);

    const handleAddClick = useCallback(() => {
        setIsAdding(true);
        setNewValue("");
        onFocus?.();
    }, [onFocus]);

    const handleBlur = useCallback(() => {
        const trimmed = newValue.trim();
        if (trimmed && !items.includes(trimmed)) {
            onAdd(trimmed);
        }
        setIsAdding(false);
        setNewValue("");
        onBlur?.();
    }, [newValue, items, onAdd, onBlur]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = newValue.trim();
                if (trimmed && !items.includes(trimmed)) {
                    onAdd(trimmed);
                    setNewValue("");
                    // Keep input open for adding more
                }
            } else if (e.key === "Escape") {
                setIsAdding(false);
                setNewValue("");
                onBlur?.();
            } else if (e.key === "Backspace" && !newValue && items.length > 0) {
                // Remove last chip when backspacing on empty input
                onRemove(items.length - 1);
            }
        },
        [newValue, items, onAdd, onRemove, onBlur]
    );

    return (
        <div
            className={`${styles.editableChips} ${className}`}
            role="list"
            aria-label={ariaLabel}
        >
            {items.map((item, index) => (
                <span key={item} className={styles.editableChip} role="listitem">
                    {item}
                    <button
                        type="button"
                        className={styles.editableChipRemove}
                        onClick={() => onRemove(index)}
                        aria-label={`Remove ${item}`}
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                </span>
            ))}

            {isAdding ? (
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.editableChipsInput}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                />
            ) : (
                <button
                    type="button"
                    className={styles.editableChipsAdd}
                    onClick={handleAddClick}
                >
                    <span className="material-icons-round">add</span>
                    {addLabel}
                </button>
            )}
        </div>
    );
}
