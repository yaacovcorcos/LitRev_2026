import { NavLink } from "@/types/nav";
import Link from "next/link";
import styles from "@/components/Sidebar.module.css";

type SidebarProps = {
  mainLinks: NavLink[];
  bottomLinks: NavLink[];
  activeNav?: string;
  collapsed?: boolean;
  onToggle?: () => void;
};

export function Sidebar({ mainLinks, bottomLinks, activeNav = "projects", collapsed = false, onToggle }: SidebarProps) {
  const mainNavId = "sidebar-main-nav";
  const bottomNavId = "sidebar-bottom-nav";
  const asideClass = collapsed ? `${styles.sidebar} ${styles.collapsed}` : styles.sidebar;
  const toggleLabel = collapsed ? "Expand Sidebar" : "Collapse Sidebar";

  return (
    <aside className={asideClass} aria-label="Primary">
      <div className={styles.logoArea}>
        <div className={styles.logoWrapper} aria-hidden={collapsed}>
          <span className={styles.logoText}>LitRev</span>
        </div>
        <button
          className={styles.sidebarToggle}
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls={mainNavId}
          onClick={onToggle}
          type="button"
        >
          <span className="material-icons-round">menu_open</span>
        </button>
      </div>

      <nav className={styles.mainNav} id={mainNavId} aria-label="Main navigation">
        {mainLinks.map((link) => (
          <Link
            key={link.navKey}
            href={link.href}
            className={`${styles.navItem} ${activeNav === link.navKey ? styles.active : ""}`}
            data-nav={link.navKey}
            aria-current={activeNav === link.navKey ? "page" : undefined}
            aria-label={link.label}
          >
            <span className={`material-icons-round ${styles.navIcon}`}>{link.icon}</span>
            <span className={styles.navLabel} aria-hidden={collapsed}>
              {link.label}
            </span>
          </Link>
        ))}
      </nav>

      <div className={styles.bottomNav} id={bottomNavId} aria-label="Secondary">
        {bottomLinks.map((link) => (
          <Link key={link.navKey} href={link.href} className={styles.navItem} aria-label={link.label}>
            <span className={`material-icons-round ${styles.navIcon}`}>{link.icon}</span>
            <span className={styles.navLabel} aria-hidden={collapsed}>
              {link.label}
            </span>
          </Link>
        ))}
      </div>
    </aside>
  );
}
