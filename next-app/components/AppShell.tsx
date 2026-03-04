"use client";

import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import {
  adminMainNavLink,
  adminMobileNavLink,
  bottomNavLinks,
  mainNavLinks,
  mobileNavLinks,
} from "@/data/navLinks";
import styles from "@/components/AppShell.module.css";
import { usePathname, useRouter } from "next/navigation";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { SlimHeader } from "@/components/SlimHeader";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { authClient } from "@/lib/auth-client";

type AppShellProps = {
  activeNav: string;
  children: ReactNode;
  showMobileNav?: boolean;
  onNewProject?: () => void;
  noMainPadding?: boolean;
  mainClassName?: string;
  initiallyCollapsed?: boolean;
  forceAdminNav?: boolean;
};

export function AppShell({
  activeNav,
  children,
  showMobileNav = true,
  onNewProject,
  noMainPadding = false,
  mainClassName = "",
  initiallyCollapsed,
  forceAdminNav = false,
}: AppShellProps) {
  const pathname = usePathname();
  const shouldDefaultCollapse = pathname !== "/";
  const [collapsed, setCollapsed] = useState(initiallyCollapsed ?? shouldDefaultCollapse);
  const [mobileSigningOut, setMobileSigningOut] = useState(false);
  const [mobileSignOutError, setMobileSignOutError] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(forceAdminNav);
  const router = useRouter();
  const { registerSidebarToggle } = useCommandPalette();

  useEffect(() => {
    registerSidebarToggle(() => setCollapsed((prev) => !prev));
    return () => registerSidebarToggle(null);
  }, [registerSidebarToggle]);

  useEffect(() => {
    if (forceAdminNav) {
      setIsPlatformAdmin(true);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const loadAdminStatus = async () => {
      try {
        const response = await fetch("/api/admin/status", {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          if (!cancelled) setIsPlatformAdmin(false);
          return;
        }

        const payload = await response.json() as { isPlatformAdmin?: boolean };
        if (!cancelled) {
          setIsPlatformAdmin(Boolean(payload.isPlatformAdmin));
        }
      } catch {
        if (!cancelled) setIsPlatformAdmin(false);
      }
    };

    void loadAdminStatus();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [forceAdminNav]);

  const cssVars = useMemo(() => {
    return {
      "--shell-gutter": collapsed ? "32px" : "50px",
      "--shell-sidebar-width": collapsed ? "68px" : "200px",
    } as CSSProperties;
  }, [collapsed]);

  const sidebarMainLinks = useMemo(
    () => (isPlatformAdmin ? [...mainNavLinks, adminMainNavLink] : mainNavLinks),
    [isPlatformAdmin],
  );

  const shellMobileNavLinks = useMemo(
    () => (isPlatformAdmin ? [...mobileNavLinks, adminMobileNavLink] : mobileNavLinks),
    [isPlatformAdmin],
  );

  const handleNewProject = () => {
    if (onNewProject) {
      onNewProject();
      return;
    }
    router.push("/?create=new");
  };

  const handleMobileSignOut = async () => {
    if (mobileSigningOut) return;
    setMobileSigningOut(true);
    setMobileSignOutError(null);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setMobileSignOutError(result.error.message || "Sign out failed. Try again.");
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setMobileSignOutError("Sign out failed. Try again.");
    } finally {
      setMobileSigningOut(false);
    }
  };

  return (
    <>
      <SlimHeader ariaHidden />
      <div
        className={styles.appContainer}
        data-sidebar-collapsed={collapsed}
        style={cssVars}
      >
        <Sidebar
          mainLinks={sidebarMainLinks}
          bottomLinks={bottomNavLinks}
          activeNav={activeNav}
          collapsed={collapsed}
          onToggle={() => setCollapsed((prev) => !prev)}
        />
        <main
          className={`${styles.mainContent} ${noMainPadding ? styles.mainContentNoPad : ""} ${mainClassName}`.trim()}
          role="main"
        >
          {children}
        </main>
        {showMobileNav ? (
          <MobileNav
            links={shellMobileNavLinks}
            activeNav={activeNav}
            onNewProject={handleNewProject}
            onSignOut={handleMobileSignOut}
            signOutBusy={mobileSigningOut}
            signOutError={mobileSignOutError}
          />
        ) : null}
      </div>
    </>
  );
}
