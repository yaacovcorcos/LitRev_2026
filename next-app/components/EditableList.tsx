"use client";

/**
 * EditableList - An editable list of items with add/remove functionality.
 * Perfect for inclusion/exclusion criteria.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./Editable.module.css";

export type EditableListProps = {
    /** List items */
    items: string[];
    /** Callback when an item is updated */
    onUpdate: (index: number, value: string) => void;
    /** Callback to add a new item */
    onAdd: (value: string) => void;
    /** Callback to remove an item */
    onRemove: (index: number) => void;
    /** Placeholder for empty items */
    placeholder?: string;
    /** Add button label */
    addLabel?: string;
    /** Whether the list is currently active */
    isActive?: boolean;
    /** Callback when any item in the list is focused */
    onFocus?: () => void;
    /** Callback when focus leaves the list */
    onBlur?: () => void;
    /** Additional className for the wrapper */
    className?: string;
    /** aria-label for the list */
    ariaLabel?: string;
    /** Optional render hook for row-level actions */
    renderItemActions?: (index: number, item: string) => ReactNode;
};

export function EditableList({
    items,
    onUpdate,
    onAdd,
    onRemove,
    placeholder = "Enter item...",
    addLabel = "Add item",
    onFocus,
    onBlur,
    className = "",
    ariaLabel,
    renderItemActions,
}: EditableListProps) {
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editValue, setEditValue] = useState("");
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newValue, setNewValue] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const newInputRef = useRef<HTMLInputElement>(null);

    // Focus input when entering edit mode
    useEffect(() => {
        if (editingIndex !== null && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingIndex]);

    // Focus new input when adding
    useEffect(() => {
        if (isAddingNew && newInputRef.current) {
            newInputRef.current.focus();
        }
    }, [isAddingNew]);

    const handleItemClick = useCallback(
        (index: number) => {
            setEditingIndex(index);
            setEditValue(items[index]);
            onFocus?.();
        },
        [items, onFocus]
    );

    const handleItemBlur = useCallback(() => {
        if (editingIndex === null) return;
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== items[editingIndex]) {
            onUpdate(editingIndex, trimmed);
        } else if (!trimmed) {
            // Empty - remove the item
            onRemove(editingIndex);
        }
        setEditingIndex(null);
        setEditValue("");
        onBlur?.();
    }, [editingIndex, editValue, items, onUpdate, onRemove, onBlur]);

    const handleItemKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                inputRef.current?.blur();
            } else if (e.key === "Escape") {
                setEditValue(editingIndex !== null ? items[editingIndex] : "");
                setEditingIndex(null);
                onBlur?.();
            }
        },
        [editingIndex, items, onBlur]
    );

    const handleAddClick = useCallback(() => {
        setIsAddingNew(true);
        setNewValue("");
        onFocus?.();
    }, [onFocus]);

    const handleAddBlur = useCallback(() => {
        const trimmed = newValue.trim();
        if (trimmed) {
            onAdd(trimmed);
        }
        setIsAddingNew(false);
        setNewValue("");
        onBlur?.();
    }, [newValue, onAdd, onBlur]);

    const handleAddKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = newValue.trim();
                if (trimmed) {
                    onAdd(trimmed);
                    setNewValue("");
                    // Keep focus for adding more
                }
            } else if (e.key === "Escape") {
                setIsAddingNew(false);
                setNewValue("");
                onBlur?.();
            }
        },
        [newValue, onAdd, onBlur]
    );

    return (
        <div
            className={`${styles.editableList} ${className}`}
            role="list"
            aria-label={ariaLabel}
        >
            {items.map((item, index) => (
                <div
                    key={index}
                    className={`${styles.editableListItem} ${editingIndex === index ? styles.active : ""}`}
                >
                    <span className={styles.editableListBullet}>•</span>
                    <div className={styles.editableListContent}>
                        {editingIndex === index ? (
                            <input
                                ref={inputRef}
                                type="text"
                                className={styles.editableListInput}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleItemBlur}
                                onKeyDown={handleItemKeyDown}
                                placeholder={placeholder}
                            />
                        ) : (
                            <div
                                className={styles.editableListText}
                                onClick={() => handleItemClick(index)}
                                onFocus={() => handleItemClick(index)}
                                tabIndex={0}
                                role="textbox"
                            >
                                {item}
                            </div>
                        )}
                    </div>
                    {renderItemActions ? (
                        <div className={styles.editableListActions}>
                            {renderItemActions(index, item)}
                        </div>
                    ) : null}
                    <button
                        type="button"
                        className={styles.editableListRemove}
                        onClick={() => onRemove(index)}
                        aria-label={`Remove "${item}"`}
                    >
                        <span className="material-icons-round">close</span>
                    </button>
                </div>
            ))}

            {isAddingNew ? (
                <div className={`${styles.editableListItem} ${styles.active}`}>
                    <span className={styles.editableListBullet}>•</span>
                    <div className={styles.editableListContent}>
                        <input
                            ref={newInputRef}
                            type="text"
                            className={styles.editableListInput}
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            onBlur={handleAddBlur}
                            onKeyDown={handleAddKeyDown}
                            placeholder={placeholder}
                        />
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    className={styles.editableListAdd}
                    onClick={handleAddClick}
                >
                    <span className="material-icons-round">add</span>
                    {addLabel}
                </button>
            )}
        </div>
    );
}
