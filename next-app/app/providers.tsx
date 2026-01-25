"use client";

import { ProjectsProvider } from "@/contexts/ProjectsContext";
import { LedgerProvider } from "@/contexts/LedgerContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ProjectsProvider>
      <LedgerProvider>{children}</LedgerProvider>
    </ProjectsProvider>
  );
}
