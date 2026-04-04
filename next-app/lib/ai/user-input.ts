export function buildPrimaryUserInputQuestionId(callId: string): string {
    return `${callId}:question-1`;
}

export function resolveUserInputQuestionId(questionId: string | null | undefined, callId: string): string {
    const trimmed = questionId?.trim();
    if (trimmed) return trimmed;
    return buildPrimaryUserInputQuestionId(callId);
}
