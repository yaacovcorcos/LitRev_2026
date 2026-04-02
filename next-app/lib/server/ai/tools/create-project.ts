import { z } from "zod";
import type { AITool } from "./base";
import { createProject } from "@/lib/server/projects";

const inputSchema = z.object({
    name: z.string().min(1, "name is required").max(200, "name must be 200 characters or less"),
    description: z.string().max(1000, "description must be 1000 characters or less").optional(),
    approved: z.boolean().optional(),
});

const outputSchema = z.object({
    projectId: z.string().optional(),
    projectName: z.string().optional(),
    navigate: z.string().optional(),
    requiresApproval: z.boolean().optional(),
    proposedName: z.string().optional(),
    message: z.string().optional(),
});

export const createProjectTool: AITool = {
    definition: {
        name: "create_project",
        description:
            "Create a new systematic review project with an auto-initialized empty protocol. Returns a navigation URL for the new project. This tool requires explicit user approval: first propose, then rerun with approved=true only after the user confirms.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description: "Project name (1-200 characters)",
                },
                description: {
                    type: "string",
                    description: "Brief description of the review topic (max 1000 characters)",
                },
                approved: {
                    type: "boolean",
                    description: "Set true only after the user explicitly approves creating the project",
                },
            },
            required: ["name"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    async execute(args: Record<string, unknown>) {
        const name = (args.name as string)?.trim();
        const description = (args.description as string | undefined)?.trim();
        const approved = args.approved === true;

        if (!name) {
            return { callId: "", result: null, error: "Project name is required" };
        }

        if (name.length > 200) {
            return { callId: "", result: null, error: "Project name must be 200 characters or less" };
        }

        if (!approved) {
            return {
                callId: "",
                result: {
                    requiresApproval: true,
                    proposedName: name,
                    message: `Project creation for "${name}" requires explicit user approval. Ask for confirmation, then call create_project again with approved=true.`,
                },
            };
        }

        try {
            const project = await createProject(undefined, {
                name,
                description,
                status: "harvesting",
                statusText: "Getting started",
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
            });

            return {
                callId: "",
                result: {
                    projectId: project.id,
                    projectName: project.name,
                    navigate: `/project/${project.id}`,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to create project",
            };
        }
    },
};
