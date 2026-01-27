"use client";

import { ReactNode } from "react";
import { useParams } from "next/navigation";
import { ProjectCopilotProvider } from "@/contexts/ProjectCopilotContext";

type ProjectLayoutProps = {
    children: ReactNode;
};

export default function ProjectLayout({ children }: ProjectLayoutProps) {
    const params = useParams<{ id: string }>();
    const projectId = params?.id ?? "";

    return (
        <ProjectCopilotProvider projectId={projectId}>
            {children}
        </ProjectCopilotProvider>
    );
}
