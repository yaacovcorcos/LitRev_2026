import { NavLink } from "@/types/nav";
import Link from "next/link";
import styles from "@/components/MobileNav.module.css";

type MobileNavProps = {
  links: NavLink[];
  activeNav?: string;
  onNewProject?: () => void;
  onSignOut?: () => void;
  signOutBusy?: boolean;
  signOutError?: string | null;
  responsiveV2Enabled?: boolean;
};

export function MobileNav({
  links,
  activeNav = "projects",
  onNewProject,
  onSignOut,
  signOutBusy = false,
  signOutError = null,
  responsiveV2Enabled = false,
}: MobileNavProps) {
  const navClassName = [styles.mobileNav, responsiveV2Enabled ? styles.responsiveV2 : ""].filter(Boolean).join(" ");

  return (
    <nav className={navClassName} aria-label="Mobile" data-responsive-v2={responsiveV2Enabled ? "true" : "false"}>
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
      {onSignOut ? (
        <button
          type="button"
          className={styles.item}
          onClick={onSignOut}
          aria-label="Sign out"
          disabled={signOutBusy}
        >
          <span className={`material-icons-round ${styles.itemIcon}`}>logout</span>
          <span>{signOutBusy ? "Signing out..." : "Sign out"}</span>
        </button>
      ) : null}
      {signOutError ? (
        <p className={styles.error} role="alert">
          {signOutError}
        </p>
      ) : null}
    </nav>
  );
}
