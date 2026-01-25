import { NavLink } from "@/types/nav";
import Link from "next/link";
import styles from "@/components/MobileNav.module.css";

type MobileNavProps = {
  links: NavLink[];
  activeNav?: string;
  onNewProject?: () => void;
};

export function MobileNav({ links, activeNav = "projects", onNewProject }: MobileNavProps) {
  return (
    <nav className={styles.mobileNav} aria-label="Mobile">
      {links.map((link) =>
        link.navKey === "new" && onNewProject ? (
          <button
            key={link.navKey}
            type="button"
            className={`${styles.item} ${activeNav === link.navKey ? styles.active : ""}`}
            data-nav={link.navKey}
            onClick={onNewProject}
            aria-current={activeNav === link.navKey ? "page" : undefined}
          >
            <span className={`material-icons-round ${styles.itemIcon}`}>{link.icon}</span>
            <span>{link.label}</span>
          </button>
        ) : (
          <Link
            key={link.navKey}
            href={link.href}
            className={`${styles.item} ${activeNav === link.navKey ? styles.active : ""}`}
            data-nav={link.navKey}
            aria-current={activeNav === link.navKey ? "page" : undefined}
          >
            <span className={`material-icons-round ${styles.itemIcon}`}>{link.icon}</span>
            <span>{link.label}</span>
          </Link>
        )
      )}
    </nav>
  );
}
