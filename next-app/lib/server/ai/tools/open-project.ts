import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { listProjects, getProject } from "@/lib/server/projects";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

const VALID_PAGES = ["overview", "protocol", "ledger", "draft"] as const;

const inputSchema = z.object({
    projectId: z.string().optional(),
    name: z.string().optional(),
    page: z.enum(VALID_PAGES).optional(),
}).refine((d) => d.projectId || d.name, {
    message: "Provide projectId or name",
});

const outputSchema = z.object({
    projectId: z.string().optional(),
    projectName: z.string().optional(),
    navigate: z.string().optional(),
    candidates: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
});

export const openProjectTool: AITool = {
    definition: {
        name: "open_project",
        description:
            "Navigate to a project. Provide projectId (preferred) or name. If name matches multiple projects, returns candidates for the user to choose from.",
        parameters: {
            type: "object",
            properties: {
                projectId: {
                    type: "string",
                    description: "Exact project ID",
                },
                name: {
                    type: "string",
                    description: "Project name (case-insensitive match)",
                },
                page: {
                    type: "string",
                    enum: [...VALID_PAGES],
                    description: "Optional page to open within the project",
                },
            },
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 3,
        allowedRange: [1, 3],
    },

    async execute(args: Record<string, unknown>, _context?: ToolExecutionContext) {
        const projectId = args.projectId as string | undefined;
        const name = (args.name as string | undefined)?.trim();
        const page = args.page as string | undefined;

        if (!projectId && !name) {
            return { callId: "", result: null, error: "Provide projectId or name" };
        }

        try {
            // Lookup by projectId
            if (projectId) {
                const project = await getProject(SINGLE_USER_SCOPE, projectId);
                if (!project) {
                    return { callId: "", result: null, error: `Project not found: ${projectId}` };
                }
                const url = buildProjectUrl(project.id, page);
                return {
                    callId: "",
                    result: {
                        projectId: project.id,
                        projectName: project.name,
                        navigate: url,
                    },
                };
            }

            // Lookup by name
            const projects = await listProjects(SINGLE_USER_SCOPE);
            const nameLower = name!.toLowerCase();

            // Try exact match first
            const exactMatch = projects.find((p) => p.name.toLowerCase() === nameLower);
            if (exactMatch) {
                const url = buildProjectUrl(exactMatch.id, page);
                return {
                    callId: "",
                    result: {
                        projectId: exactMatch.id,
                        projectName: exactMatch.name,
                        navigate: url,
                    },
                };
            }

            // Substring match
            const matches = projects.filter((p) =>
                p.name.toLowerCase().includes(nameLower)
            );

            if (matches.length === 0) {
                return { callId: "", result: null, error: `No project found matching "${name}"` };
            }

            if (matches.length === 1) {
                const url = buildProjectUrl(matches[0]!.id, page);
                return {
                    callId: "",
                    result: {
                        projectId: matches[0]!.id,
                        projectName: matches[0]!.name,
                        navigate: url,
                    },
                };
            }

            // Multiple matches — return candidates, don't navigate
            return {
                callId: "",
                result: {
                    candidates: matches.slice(0, 10).map((p) => ({
                        id: p.id,
                        name: p.name,
                    })),
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to open project",
            };
        }
    },
};

function buildProjectUrl(projectId: string, page?: string): string {
    const base = `/project/${projectId}`;
    if (page === "overview") {
        return base;
    }
    if (page && VALID_PAGES.includes(page as typeof VALID_PAGES[number])) {
        return `${base}/${page}`;
    }
    return base;
}
