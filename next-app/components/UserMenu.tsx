"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";
import styles from "@/components/UserMenu.module.css";

const THEME_CYCLE: ThemePreference[] = ["light", "light-carbon", "dark"];
const THEME_ICON: Record<ThemePreference, string> = {
  light: "light_mode",
  "light-carbon": "palette",
  dark: "dark_mode",
};
const THEME_LABEL: Record<ThemePreference, string> = {
  light: "Light",
  "light-carbon": "Light Carbon",
  dark: "Dark",
};

type UserMenuProps = {
  collapsed?: boolean;
};

export function UserMenu({ collapsed = false }: UserMenuProps) {
  const { data: session } = authClient.useSession();
  const { theme, setTheme } = useTheme();
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setHydrated(true);
  }, []);

  const cycleTheme = () => {
    const idx = THEME_CYCLE.indexOf(theme);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]);
  };

  const user = hydrated ? session?.user : null;
  const initials = user ? getInitials(user.name ?? user.email) : "?";
  const displayName = user?.name || user?.email || "Account";
  const wrapperClass = collapsed
    ? `${styles.menuWrapper} ${styles.collapsed}`
    : styles.menuWrapper;

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(result.error.message || "Unable to sign out. Please try again.");
        return;
      }

      setOpen(false);
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        className={styles.userPill}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
      >
        <span className={styles.avatar} aria-hidden="true">
          {user?.image ? (
            <img
              src={user.image}
              alt=""
              className={styles.avatarImg}
              referrerPolicy="no-referrer"
            />
          ) : (
            initials
          )}
        </span>
        {collapsed ? null : (
          <span className={styles.pillText}>
            <span className={styles.pillName}>{user?.name ?? "Account"}</span>
            {user?.email ? <span className={styles.pillEmail}>{user.email}</span> : null}
          </span>
        )}
      </button>

      {open ? (
        <>
          <div
            className={styles.backdrop}
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className={styles.dropdown} role="menu">
            {user ? (
              <div className={styles.menuIdentity}>
                <p className={styles.menuName}>{user.name ?? "Account"}</p>
                <p className={styles.menuEmail}>{user.email}</p>
              </div>
            ) : null}
            {error ? (
              <p className={styles.menuError} role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={cycleTheme}
              aria-label={`Theme: ${THEME_LABEL[theme]}. Click to change.`}
            >
              <span
                className={`material-icons-round ${styles.menuItemIcon}`}
                aria-hidden="true"
              >
                {THEME_ICON[theme]}
              </span>
              {THEME_LABEL[theme]}
            </button>
            <button
              type="button"
              className={styles.menuItemDanger}
              role="menuitem"
              disabled={busy}
              onClick={() => {
                void handleSignOut();
              }}
            >
              <span
                className={`material-icons-round ${styles.menuItemIcon}`}
                aria-hidden="true"
              >
                logout
              </span>
              {busy ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function getInitials(nameOrEmail: string): string {
  const name = nameOrEmail.trim();
  if (!name) return "?";
  // If it looks like an email, take first char before @
  if (name.includes("@")) return name[0].toUpperCase();
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}
