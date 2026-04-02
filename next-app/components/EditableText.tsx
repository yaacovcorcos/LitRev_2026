"use client";

/**
 * EditableText - An auto-expanding editable text component.
 * Uses textarea for smooth multi-line support with auto-height.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./Editable.module.css";

export type EditableTextProps = {
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
    /** aria-label for accessibility */
    ariaLabel?: string;
    /** Whether to allow multi-line input */
    multiline?: boolean;
};

export function EditableText({
    value,
    onChange,
    placeholder = "Click to edit...",
    isActive = false,
    onFocus,
    onBlur,
    className = "",
    ariaLabel,
    multiline = true,
}: EditableTextProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea to fit content
    const autoResize = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    }, []);

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
        setLocalValue(value);
        setIsEditing(true);
        onFocus?.();
    }, [onFocus, value]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        const trimmed = localValue.trim();
        if (trimmed !== value) {
            onChange(trimmed);
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
            // For single-line mode, Enter submits
            if (!multiline && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                textareaRef.current?.blur();
            }
        },
        [value, onBlur, multiline]
    );

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setLocalValue(e.target.value);
    }, []);

    if (isEditing) {
        return (
            <div className={`${styles.editableText} ${className}`}>
                <textarea
                    ref={textareaRef}
                    className={styles.editableTextInput}
                    value={localValue}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    aria-label={ariaLabel}
                    rows={1}
                    style={{ overflow: "hidden", resize: "none" }}
                />
            </div>
        );
    }

    return (
        <div className={`${styles.editableText} ${className}`}>
            <div
                className={`${styles.editableTextDisplay} ${isActive ? styles.active : ""}`}
                onClick={handleClick}
                onFocus={handleClick}
                tabIndex={0}
                role="textbox"
                aria-label={ariaLabel}
            >
                {value || <span className={styles.editableTextPlaceholder}>{placeholder}</span>}
            </div>
        </div>
    );
}
