"use client";

/**
 * EditableTextArea - An auto-expanding multi-line text component.
 * Ideal for search queries or longer text content.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Editable.module.css";

export type EditableTextAreaProps = {
    /** Current value */
    value: string;
    /** Callback when value changes */
    onChange: (value: string) => void;
    /** Placeholder text when empty */
    placeholder?: string;
    /** Whether this field is currently the active section */
    isActive?: boolean;
    /** Callback when field becomes active/focused */
    onFocus?: () => void;
    /** Callback when field loses focus */
    onBlur?: () => void;
    /** Additional className for the wrapper */
    className?: string;
    /** Minimum height for the textarea (in pixels) */
    minHeight?: number;
    /** aria-label for accessibility */
    ariaLabel?: string;
    /** Whether to use monospace font (for code/queries) */
    monospace?: boolean;
};

export function EditableTextArea({
    value,
    onChange,
    placeholder = "Click to edit...",
    isActive = false,
    onFocus,
    onBlur,
    className = "",
    minHeight = 40,
    ariaLabel,
    monospace = false,
}: EditableTextAreaProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Sync local value when prop changes (and not editing)
    useEffect(() => {
        if (!isEditing) {
            setLocalValue(value);
        }
    }, [value, isEditing]);

    // Auto-resize textarea to fit content
    const autoResize = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        const newHeight = Math.max(textarea.scrollHeight, minHeight);
        textarea.style.height = `${newHeight}px`;
    }, [minHeight]);

    // Focus and resize when entering edit mode
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.focus();
            // Move cursor to end
            const len = textareaRef.current.value.length;
            textareaRef.current.setSelectionRange(len, len);
            autoResize();
        }
    }, [isEditing, autoResize]);

    // Resize on value change
    useEffect(() => {
        if (isEditing) {
            autoResize();
        }
    }, [localValue, isEditing, autoResize]);

    const handleClick = useCallback(() => {
        setIsEditing(true);
        onFocus?.();
    }, [onFocus]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        if (localValue !== value) {
            onChange(localValue);
        }
        onBlur?.();
    }, [localValue, value, onChange, onBlur]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Escape") {
                setLocalValue(value); // Revert
                setIsEditing(false);
                onBlur?.();
            }
        },
        [value, onBlur]
    );

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalValue(e.target.value);
    }, []);

    const monoClass = monospace ? styles.monospace : "";

    if (isEditing) {
        return (
            <div className={`${styles.editableTextArea} ${className}`}>
                <textarea
                    ref={textareaRef}
                    className={`${styles.editableTextAreaInput} ${monoClass}`}
                    value={localValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    aria-label={ariaLabel}
                    rows={1}
                    style={{
                        overflow: "hidden",
                        resize: "none",
                        minHeight: `${minHeight}px`,
                    }}
                />
            </div>
        );
    }

    return (
        <div className={`${styles.editableTextArea} ${className}`}>
            <div
                className={`${styles.editableTextAreaDisplay} ${isActive ? styles.active : ""} ${monoClass}`}
                onClick={handleClick}
                onFocus={handleClick}
                tabIndex={0}
                role="textbox"
                aria-label={ariaLabel}
                aria-multiline="true"
                style={{ minHeight: `${minHeight}px` }}
            >
                {value || <span className={styles.editableTextPlaceholder}>{placeholder}</span>}
            </div>
        </div>
    );
}
