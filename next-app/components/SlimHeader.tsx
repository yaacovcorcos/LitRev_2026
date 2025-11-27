import { ReactNode } from "react";
import styles from "@/components/SlimHeader.module.css";

type SlimHeaderProps = {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  className?: string;
  ariaHidden?: boolean;
};

export function SlimHeader({ left, center, right, className = "", ariaHidden }: SlimHeaderProps) {
  const cls = `${styles.header} ${className}`.trim();
  return (
    <header className={cls} aria-hidden={ariaHidden || undefined} role={ariaHidden ? undefined : "banner"}>
      <div className={styles.slotLeft}>{left}</div>
      <div className={styles.slotCenter}>{center}</div>
      <div className={styles.slotRight}>{right}</div>
    </header>
  );
}
