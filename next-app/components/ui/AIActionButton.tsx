"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AIActionButton.module.css";

type Props = {
    disabled?: boolean;
    onAskAi: () => void;
    onPropose: () => void;
    onAutofill: () => void;
};

export function AIActionButton({ disabled, onAskAi, onPropose, onAutofill }: Props) {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (event: MouseEvent) => {
            if (!wrapperRef.current) return;
            if (!wrapperRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onDocClick);
        return () => document.removeEventListener("mousedown", onDocClick);
    }, []);

    return (
        <div
            ref={wrapperRef}
            className={styles.wrapper}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                type="button"
                className={`btn btn-outline ${styles.button}`}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((prev) => !prev)}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span className="material-icons-round">smart_toy</span>
                AI
            </button>

            {open ? (
                <div className={styles.menu} role="menu" aria-label="AI actions">
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setOpen(false); onAskAi(); }}>
                        <span className="material-icons-round" style={{ fontSize: 16 }}>chat</span>
                        Ask AI
                    </button>
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setOpen(false); onPropose(); }}>
                        <span className="material-icons-round" style={{ fontSize: 16 }}>fact_check</span>
                        Propose
                    </button>
                    <button type="button" role="menuitem" className={styles.menuItem} onClick={() => { setOpen(false); onAutofill(); }}>
                        <span className="material-icons-round" style={{ fontSize: 16 }}>auto_awesome</span>
                        Auto-fill
                    </button>
                </div>
            ) : null}
        </div>
    );
}
