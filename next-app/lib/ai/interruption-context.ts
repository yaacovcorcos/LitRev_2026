type InterruptedUserMessageParams = {
    newUserMessage: string;
    previousUserMessage: string;
    partialAssistantResponse?: string | null;
};

const PREVIOUS_MESSAGE_MAX_CHARS = 800;
const PARTIAL_RESPONSE_MAX_CHARS = 1400;

function truncate(value: string, maxChars: number): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars).trimEnd()}…`;
}

/**
 * Wraps a newly entered message with explicit interruption metadata so the model
 * can decide whether to continue the previous trajectory or switch topics.
 */
export function buildInterruptedUserMessage(params: InterruptedUserMessageParams): string {
    const previousUser = truncate(params.previousUserMessage.trim(), PREVIOUS_MESSAGE_MAX_CHARS);
    const partialAssistant = truncate((params.partialAssistantResponse ?? "").trim(), PARTIAL_RESPONSE_MAX_CHARS);
    const currentUser = params.newUserMessage.trim();

    return [
        "[INTERRUPTION_CONTEXT]",
        "The user stopped your previous response and sent a new message.",
        "Decide if the new message is a follow-up that should continue prior work, or a new request that should replace it.",
        "If it is a follow-up, use both the previous request and the new message.",
        "If it is a new request, prioritize the new message and only keep prior context when useful.",
        "",
        "Previous user message:",
        previousUser || "(empty)",
        "",
        "Partial assistant response before interruption:",
        partialAssistant || "(none)",
        "[/INTERRUPTION_CONTEXT]",
        "",
        "[NEW_USER_MESSAGE]",
        currentUser,
        "[/NEW_USER_MESSAGE]",
    ].join("\n");
}
