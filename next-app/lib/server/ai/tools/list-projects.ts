import { z } from "zod";
import type { AITool } from "./base";
import { listProjects } from "@/lib/server/projects";
import { prisma } from "@/lib/server/prisma";

const MAX_RESULTS = 50;

const inputSchema = z.object({
    query: z.string().optional(),
});

const outputSchema = z.object({
    projects: z.array(z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        studyCount: z.number(),
        updatedAt: z.string(),
    })),
    total: z.number(),
});

export const listProjectsTool: AITool = {
    definition: {
        name: "list_projects",
        description:
            "List the user's projects. Returns id, name, status, studyCount, and updatedAt. Max 50 results, ordered by last modified. Use the optional query parameter to filter by name.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Optional name filter (case-insensitive substring match)",
                },
            },
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 3,
        allowedRange: [2, 4],
    },

    async execute(args: Record<string, unknown>) {
        const query = (args.query as string | undefined)?.trim().toLowerCase();

        try {
            let projects = await listProjects(undefined);

            if (query) {
                projects = projects.filter((p) =>
                    p.name.toLowerCase().includes(query)
                );
            }

            const total = projects.length;
            const capped = projects.slice(0, MAX_RESULTS);

            // Enrich with study counts
            const enriched = await Promise.all(
                capped.map(async (p) => {
                    const studyCount = await prisma.study.count({
                        where: { projectId: p.id },
                    });
                    return {
                        id: p.id,
                        name: p.name,
                        status: p.status,
                        studyCount,
                        updatedAt: p.modified,
                    };
                })
            );

            return {
                callId: "",
                result: { projects: enriched, total },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to list projects",
            };
        }
    },
};
