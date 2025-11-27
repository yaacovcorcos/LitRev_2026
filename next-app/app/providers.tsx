"use client";

import { ProjectsProvider } from "@/contexts/ProjectsContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ProjectsProvider>{children}</ProjectsProvider>;
}
