"use client";

import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { LedgerProvider } from "@/contexts/LedgerContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { ToastContainer } from "@/components/ui/Toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
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
  );
}
