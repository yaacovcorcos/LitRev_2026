import styles from "@/components/TopBar.module.css";

type TopBarProps = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  centerContent?: React.ReactNode;
  eyebrow?: string;
  className?: string;
};

export function TopBar({ title, subtitle, actions, centerContent, eyebrow, className = "" }: TopBarProps) {
  return (
    <header className={`${styles.topBar} ${className}`.trim()}>
      <div className={styles.titles}>
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <div className={styles.titleRow}>
          <h1>{title}</h1>
        </div>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {centerContent ? <div className={styles.center}>{centerContent}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
