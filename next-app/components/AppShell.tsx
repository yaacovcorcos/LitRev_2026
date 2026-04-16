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
import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlimHeader } from "@/components/SlimHeader";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { authClient } from "@/lib/auth-client";
import { clearAllContextCaptureHistory } from "@/lib/context-capture/history";
import { isMobileShellV2Enabled } from "@/lib/mobile/feature-flags";
import { getViewportClass, type ResponsiveViewportClass } from "@/lib/mobile/tiers";

type AppShellProps = {
  activeNav: string;
  children: ReactNode;
  showMobileNav?: boolean;
  onNewProject?: () => void;
  noMainPadding?: boolean;
  mainClassName?: string;
  initiallyCollapsed?: boolean;
  forceAdminNav?: boolean;
  skipAdminStatusCheck?: boolean;
  skipUserMenu?: boolean;
};

function resolveDefaultCollapse(
  pathname: string,
  viewportClass: ResponsiveViewportClass,
  shellV2Enabled: boolean,
): boolean {
  if (shellV2Enabled && (viewportClass === "phone" || viewportClass === "compact")) {
    return true;
  }

  return pathname !== "/";
}

export function AppShell({
  activeNav,
  children,
  showMobileNav = true,
  onNewProject,
  noMainPadding = false,
  mainClassName = "",
  initiallyCollapsed,
  forceAdminNav = false,
  skipAdminStatusCheck = false,
  skipUserMenu = false,
}: AppShellProps) {
  const pathname = usePathname();
  const shellV2Enabled = isMobileShellV2Enabled();
  const [mobileSigningOut, setMobileSigningOut] = useState(false);
  const [mobileSignOutError, setMobileSignOutError] = useState<string | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(forceAdminNav);
  const [viewportClass, setViewportClass] = useState<ResponsiveViewportClass>("unknown");
  const defaultCollapsed = useMemo(
    () => resolveDefaultCollapse(pathname, viewportClass, shellV2Enabled),
    [pathname, shellV2Enabled, viewportClass],
  );
  const [collapsed, setCollapsed] = useState(initiallyCollapsed ?? defaultCollapsed);
  const hasManualToggleRef = useRef(false);
  const router = useRouter();
  const { registerSidebarToggle } = useCommandPalette();

  useEffect(() => {
    if (!shellV2Enabled) {
      setViewportClass("unknown");
      return;
    }

    const updateViewportClass = () => {
      setViewportClass(getViewportClass(window));
    };

    updateViewportClass();
    window.addEventListener("resize", updateViewportClass, { passive: true });
    window.addEventListener("orientationchange", updateViewportClass, { passive: true });

    return () => {
      window.removeEventListener("resize", updateViewportClass);
      window.removeEventListener("orientationchange", updateViewportClass);
    };
  }, [shellV2Enabled]);

  useEffect(() => {
    if (initiallyCollapsed !== undefined) {
      hasManualToggleRef.current = false;
      setCollapsed(initiallyCollapsed);
      return;
    }

    if (!hasManualToggleRef.current) {
      setCollapsed(defaultCollapsed);
    }
  }, [defaultCollapsed, initiallyCollapsed]);

  const toggleSidebar = useCallback(() => {
    hasManualToggleRef.current = true;
    setCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    registerSidebarToggle(toggleSidebar);
    return () => registerSidebarToggle(null);
  }, [registerSidebarToggle, toggleSidebar]);

  useEffect(() => {
    if (forceAdminNav) {
      setIsPlatformAdmin(true);
      return;
    }

    if (skipAdminStatusCheck) {
      setIsPlatformAdmin(false);
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

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = window.requestIdleCallback(() => {
        if (!cancelled) {
          void loadAdminStatus();
        }
      });
    } else {
      timeoutHandle = globalThis.setTimeout(() => {
        if (!cancelled) {
          void loadAdminStatus();
        }
      }, 0);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        globalThis.clearTimeout(timeoutHandle);
      }
      controller.abort();
    };
  }, [forceAdminNav, skipAdminStatusCheck]);

  const cssVars = useMemo(() => {
    const shellSidebarWidth = shellV2Enabled && viewportClass === "phone"
      ? "0px"
      : collapsed ? "68px" : "200px";

    return {
      "--shell-gutter": collapsed ? "32px" : "50px",
      "--shell-sidebar-width": shellSidebarWidth,
    } as CSSProperties;
  }, [collapsed, shellV2Enabled, viewportClass]);

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

      clearAllContextCaptureHistory();
      router.replace("/login");
      router.refresh();
    } catch {
      setMobileSignOutError("Sign out failed. Try again.");
    } finally {
      setMobileSigningOut(false);
    }
  };

  const containerClassName = [
    styles.appContainer,
    shellV2Enabled ? `surface-root ${styles.shellV2}` : "",
  ].filter(Boolean).join(" ");

  const mainClassNames = [
    styles.mainContent,
    noMainPadding ? styles.mainContentNoPad : "",
    mainClassName,
  ].filter(Boolean).join(" ");

  return (
    <>
      <SlimHeader ariaHidden />
      <div
        className={containerClassName}
        data-sidebar-collapsed={collapsed}
        data-shell-tier={shellV2Enabled ? viewportClass : "legacy"}
        data-shell-v2={shellV2Enabled ? "true" : "false"}
        data-surface-height={shellV2Enabled ? "shell" : undefined}
        style={cssVars}
      >
        <Sidebar
          mainLinks={sidebarMainLinks}
          bottomLinks={bottomNavLinks}
          activeNav={activeNav}
          collapsed={collapsed}
          onToggle={toggleSidebar}
          responsiveV2Enabled={shellV2Enabled}
          hideUserMenu={skipUserMenu}
        />
        <main
          className={mainClassNames}
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
            responsiveV2Enabled={shellV2Enabled}
          />
        ) : null}
      </div>
    </>
  );
}
