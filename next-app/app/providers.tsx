"use client";

import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { LedgerProvider } from "@/contexts/LedgerContext";
import { CommandPaletteProvider } from "@/contexts/CommandPaletteContext";
import { CommandPalette } from "@/components/CommandPalette";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CommandPaletteProvider>
      <ProjectsProvider>
        <LedgerProvider>
          {children}
          <CommandPalette />
        </LedgerProvider>
      </ProjectsProvider>
    </CommandPaletteProvider>
  );
}
