import { describe, expect, it } from "vitest";
import { askUserTool } from "@/lib/server/ai/tools/ask-user";

describe("askUserTool", () => {
    it("has expected definition and autonomy", () => {
        expect(askUserTool.definition.name).toBe("ask_user");
        expect(askUserTool.autonomy).toEqual({
            defaultLevel: 4,
            allowedRange: [4, 4],
            hardCap: 4,
        });
    });

    it("returns requiresUserInput sentinel for single_choice", async () => {
        const result = await askUserTool.execute({
            question: "Which database to use?",
            questionType: "single_choice",
            options: [
                { label: "PubMed", description: "National Library of Medicine" },
                { label: "Semantic Scholar", description: "AI-powered search" },
            ],
            header: "Search",
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.callId).toMatch(/^ask_user_[0-9a-f-]{36}$/);
        expect(result.result).toEqual({
            status: "waiting_for_user_input",
            callId: result.callId,
        });
        expect(result.userInputRequest).toMatchObject({
            callId: result.callId,
            questionId: `${result.callId}:question-1`,
            question: "Which database to use?",
            questionType: "single_choice",
            options: [
                { optionId: "pubmed", label: "PubMed", description: "National Library of Medicine" },
                { optionId: "semantic-scholar", label: "Semantic Scholar", description: "AI-powered search" },
            ],
            header: "Search",
            context: undefined,
            decisionRequest: {
                id: result.callId,
                callId: result.callId,
                status: "pending",
                decisionBoundaryKey: "which-database-to-use",
                questions: [
                    expect.objectContaining({
                        questionId: `${result.callId}:question-1`,
                        prompt: "Which database to use?",
                        responseKind: "single_choice",
                    }),
                ],
            },
        });
    });

    it("normalizes yes_no to Yes/No options", async () => {
        const result = await askUserTool.execute({
            question: "Include animal studies?",
            questionType: "yes_no",
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.userInputRequest?.questionType).toBe("yes_no");
        expect(result.userInputRequest?.options).toEqual([
            { optionId: "yes", label: "Yes" },
            { optionId: "no", label: "No" },
        ]);
    });

    it("returns no options for free_text", async () => {
        const result = await askUserTool.execute({
            question: "What is your research question?",
            questionType: "free_text",
            context: "I need to understand your focus area",
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.userInputRequest?.questionType).toBe("free_text");
        expect(result.userInputRequest?.options).toBeUndefined();
        expect(result.userInputRequest?.context).toBe("I need to understand your focus area");
    });

    it("passes through multi_select with valid options", async () => {
        const result = await askUserTool.execute({
            question: "Which studies to include?",
            questionType: "multi_select",
            options: [
                { label: "Study A" },
                { label: "Study B" },
                { label: "Study C" },
            ],
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.userInputRequest?.questionType).toBe("multi_select");
        expect(result.userInputRequest?.options).toHaveLength(3);
    });

    it("degrades single_choice to free_text when options missing", async () => {
        const result = await askUserTool.execute({
            question: "Which approach?",
            questionType: "single_choice",
            // no options provided
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.userInputRequest?.questionType).toBe("free_text");
        expect(result.userInputRequest?.options).toBeUndefined();
    });

    it("degrades multi_select to free_text when options missing", async () => {
        const result = await askUserTool.execute({
            question: "Which studies?",
            questionType: "multi_select",
            // no options provided
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.userInputRequest?.questionType).toBe("free_text");
        expect(result.userInputRequest?.options).toBeUndefined();
    });

    it("degrades single_choice to free_text when only 1 option provided", async () => {
        const result = await askUserTool.execute({
            question: "Which approach?",
            questionType: "single_choice",
            options: [{ label: "Only option" }],
        });

        expect(result.requiresUserInput).toBe(true);
        expect(result.userInputRequest?.questionType).toBe("free_text");
        expect(result.userInputRequest?.options).toBeUndefined();
    });

    it("generates unique callIds", async () => {
        const result1 = await askUserTool.execute({
            question: "Q1?",
            questionType: "yes_no",
        });
        const result2 = await askUserTool.execute({
            question: "Q2?",
            questionType: "yes_no",
        });

        expect(result1.callId).not.toBe(result2.callId);
        expect(result1.userInputRequest?.questionId).not.toBe(result2.userInputRequest?.questionId);
    });

    it("validates input schema rejects empty question", () => {
        const result = askUserTool.inputSchema!.safeParse({
            question: "",
            questionType: "yes_no",
        });
        expect(result.success).toBe(false);
    });

    it("validates input schema rejects invalid questionType", () => {
        const result = askUserTool.inputSchema!.safeParse({
            question: "Valid question?",
            questionType: "invalid_type",
        });
        expect(result.success).toBe(false);
    });

    it("validates input schema accepts valid single_choice", () => {
        const result = askUserTool.inputSchema!.safeParse({
            question: "Which one?",
            questionType: "single_choice",
            options: [
                { label: "A", description: "Option A" },
                { label: "B" },
            ],
            header: "Choice",
            context: "Pick one",
        });
        expect(result.success).toBe(true);
    });

    it("validates input schema rejects options with fewer than 2 items", () => {
        const result = askUserTool.inputSchema!.safeParse({
            question: "Which one?",
            questionType: "single_choice",
            options: [{ label: "Only one" }],
        });
        expect(result.success).toBe(false);
    });

    it("validates input schema rejects header values longer than 20 chars", () => {
        const result = askUserTool.inputSchema!.safeParse({
            question: "Which one?",
            questionType: "single_choice",
            options: [{ label: "A" }, { label: "B" }],
            header: "This header is definitely too long",
        });
        expect(result.success).toBe(true);
    });

    it("normalizes long header values instead of surfacing a validation failure", async () => {
        const result = await askUserTool.execute({
            question: "Which one?",
            questionType: "single_choice",
            options: [{ label: "A" }, { label: "B" }],
            header: "What is the research question, topic, or specific project",
        });

        expect(result.userInputRequest?.header).toBe("What is the research");
    });

    it("validates input schema rejects more than 10 options", () => {
        const result = askUserTool.inputSchema!.safeParse({
            question: "Pick one",
            questionType: "single_choice",
            options: Array.from({ length: 11 }, (_, i) => ({ label: `Option ${i + 1}` })),
        });
        expect(result.success).toBe(false);
    });
});
