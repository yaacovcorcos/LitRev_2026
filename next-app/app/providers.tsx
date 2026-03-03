"use client";

import { ThemeProvider } from "@/contexts/ThemeContext";
import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { LedgerProvider } from "@/contexts/LedgerContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ToastContainer } from "@/components/ui/Toast";
import { MobileViewportRuntime } from "@/components/mobile/MobileViewportRuntime";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <MobileViewportRuntime />
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
