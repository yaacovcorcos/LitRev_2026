/**
 * ask_user Tool
 * Structured user input request — the model calls this when it needs
 * a decision, preference, or clarification before proceeding.
 * Returns a sentinel that pauses the agent loop and renders an inline
 * input card on the client. (Wave 1 — CAG-002)
 *
 * Options support label+description pairs for richer presentation.
 * The client always adds an "Other" free-text escape hatch.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AITool } from "./base";
import type { UserInputOption } from "@/types/ai";

const optionSchema = z.object({
    label: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
});

const inputSchema = z.object({
    question: z.string().min(1).max(500),
    questionType: z.enum(["single_choice", "yes_no", "free_text", "multi_select"]),
    options: z.array(optionSchema).min(2).max(10).optional(),
    header: z.string().max(20).optional(),
    context: z.string().max(300).optional(),
    recommendedAnswer: z.string().max(300).optional(),
    recommendedReason: z.string().max(300).optional(),
    decisionBoundaryKey: z.string().max(120).optional(),
});

const outputSchema = z.object({
    status: z.literal("waiting_for_user_input"),
    callId: z.string(),
});

export const askUserTool: AITool = {
    definition: {
        name: "ask_user",
        description:
            "Ask the user a structured question when you need their input before proceeding. " +
            "Use this when: (1) there are multiple valid approaches and the wrong guess would waste work, " +
            "(2) you need a user preference or decision (e.g., which studies to include, PICO choices), " +
            "(3) requirements are ambiguous and you need clarification. " +
            "Do NOT use this for rhetorical questions, routine narrowing in scoping, or when you can reasonably proceed with a broad evidence-first pass.",
        parameters: {
            type: "object",
            properties: {
                question: {
                    type: "string",
                    description: "The question to ask the user. Be specific and concise.",
                },
                questionType: {
                    type: "string",
                    enum: ["single_choice", "yes_no", "free_text", "multi_select"],
                    description:
                        "single_choice: pick one option. yes_no: binary yes/no. " +
                        "free_text: open-ended text input. multi_select: pick one or more options.",
                },
                options: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            label: { type: "string", description: "Short label for the option (1-5 words)." },
                            description: { type: "string", description: "Explanation of what this option means or its implications." },
                        },
                        required: ["label"],
                    },
                    description:
                        "Required for single_choice and multi_select. Each option has a label and optional description. " +
                        "For yes_no, defaults to Yes/No. Not used for free_text. " +
                        "The client automatically adds an 'Other' free-text option.",
                },
                header: {
                    type: "string",
                    description: "Short category label displayed as a tag (max ~12 chars, e.g., 'Scope', 'Providers').",
                },
                context: {
                    type: "string",
                    description: "Optional brief context explaining why you're asking.",
                },
                recommendedAnswer: {
                    type: "string",
                    description: "Safe recommended default the user can accept directly when one exists.",
                },
                recommendedReason: {
                    type: "string",
                    description: "Short explanation for why the recommended default is safe.",
                },
                decisionBoundaryKey: {
                    type: "string",
                    description: "Optional stable key describing the decision boundary, used to suppress repeated blocking clarifications.",
                },
            },
            required: ["question", "questionType"],
        },
    },
    inputSchema,
    outputSchema,
    autonomy: {
        defaultLevel: 4,
        allowedRange: [4, 4],
        hardCap: 4,
    },
    async execute(args: Record<string, unknown>) {
        const question = args.question as string;
        const questionType = args.questionType as "single_choice" | "yes_no" | "free_text" | "multi_select";
        const rawOptions = args.options as UserInputOption[] | undefined;
        const header = args.header as string | undefined;
        const context = args.context as string | undefined;
        const recommendedAnswer = args.recommendedAnswer as string | undefined;
        const recommendedReason = args.recommendedReason as string | undefined;
        const decisionBoundaryKey = args.decisionBoundaryKey as string | undefined;

        // Normalize options and guard against missing options on choice types
        let resolvedQuestionType = questionType;
        let resolvedOptions: UserInputOption[] | undefined;

        if (questionType === "yes_no") {
            resolvedOptions = [{ label: "Yes" }, { label: "No" }];
        } else if (questionType === "free_text") {
            resolvedOptions = undefined;
        } else if (rawOptions && rawOptions.length >= 2) {
            resolvedOptions = rawOptions;
        } else {
            // single_choice or multi_select called without options — degrade to free_text
            resolvedQuestionType = "free_text";
            resolvedOptions = undefined;
        }

        const callId = `ask_user_${randomUUID()}`;

        return {
            callId,
            result: { status: "waiting_for_user_input", callId },
            requiresUserInput: true,
            userInputRequest: {
                callId,
                question,
                questionType: resolvedQuestionType,
                options: resolvedOptions,
                header,
                context,
                recommendedAnswer,
                recommendedReason,
                decisionBoundaryKey,
            },
        };
    },
};
