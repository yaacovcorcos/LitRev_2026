"use client";

import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { LedgerProvider } from "@/contexts/LedgerContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ToastContainer } from "@/components/ui/ToastContainer";
import { MobileViewportRuntime } from "@/components/mobile/MobileViewportRuntime";
import { PerformanceVitalsReporter } from "@/app/PerformanceVitalsReporter";
import { usePathname } from "next/navigation";

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDesignRoute = pathname.startsWith("/design");

  if (isDesignRoute) {
    return (
      <ThemeProvider>
        <MobileViewportRuntime />
        <NotificationProvider>
          <CommandPaletteProvider>
            {children}
          </CommandPaletteProvider>
          <ToastContainer />
        </NotificationProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <MobileViewportRuntime />
      <PerformanceVitalsReporter />
      <NotificationProvider>
        <CommandPaletteProvider>
          <ProjectsProvider>
            <LedgerProvider>
              {children}
              <CommandPalette />
            </LedgerProvider>
          </ProjectsProvider>
        </CommandPaletteProvider>
        <ToastContainer />
      </NotificationProvider>
    </ThemeProvider>
  );
}
