"use client";

import { useContext } from "react";
import { ProjectDataContext } from "@/contexts/ProjectDataContext";

export function useProjectData() {
    const ctx = useContext(ProjectDataContext);
    if (!ctx) {
        throw new Error("useProjectData must be used within ProjectDataProvider");
    }
    return ctx;
}
