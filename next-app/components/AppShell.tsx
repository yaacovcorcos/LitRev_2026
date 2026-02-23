"use client";

import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { mainNavLinks, bottomNavLinks, mobileNavLinks } from "@/data/navLinks";
import styles from "@/components/AppShell.module.css";
import { usePathname, useRouter } from "next/navigation";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { SlimHeader } from "@/components/SlimHeader";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";

type AppShellProps = {
  activeNav: string;
  children: ReactNode;
  showMobileNav?: boolean;
  onNewProject?: () => void;
  noMainPadding?: boolean;
  mainClassName?: string;
  initiallyCollapsed?: boolean;
};

export function AppShell({
  activeNav,
  children,
  showMobileNav = true,
  onNewProject,
  noMainPadding = false,
  mainClassName = "",
  initiallyCollapsed,
}: AppShellProps) {
  const pathname = usePathname();
  const shouldDefaultCollapse = pathname !== "/";
  const [collapsed, setCollapsed] = useState(initiallyCollapsed ?? shouldDefaultCollapse);
  const router = useRouter();
  const { registerSidebarToggle } = useCommandPalette();

  useEffect(() => {
    registerSidebarToggle(() => setCollapsed((prev) => !prev));
    return () => registerSidebarToggle(null);
  }, [registerSidebarToggle]);

  const cssVars = useMemo(() => {
    return {
      "--shell-gutter": collapsed ? "32px" : "50px",
      "--shell-sidebar-width": collapsed ? "88px" : "220px",
    } as CSSProperties;
  }, [collapsed]);

  const handleNewProject = () => {
    if (onNewProject) {
      onNewProject();
      return;
    }
    router.push("/?create=new");
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
          mainLinks={mainNavLinks}
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
          <MobileNav links={mobileNavLinks} activeNav={activeNav} onNewProject={handleNewProject} />
        ) : null}
      </div>
    </>
  );
}
