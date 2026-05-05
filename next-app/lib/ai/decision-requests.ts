import { buildPrimaryUserInputQuestionId, resolveUserInputQuestionId } from "@/lib/ai/user-input";
import type {
    DecisionAnswer,
    DecisionOption,
    DecisionQuestion,
    DecisionRequest,
    DecisionResolution,
    DecisionResolutionKind,
    DecisionRequestStatus,
    UserInputOption,
    UserInputRequest,
    UserInputResolution,
    UserInputResolutionKind,
} from "@/types/ai";

const DEFAULT_DECISION_KIND = "clarification";

function cleanOptionalString(value: string | null | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
}

function slugifyBoundary(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120);
}

export function resolveDecisionBoundaryKeyFromQuestion(params: {
    decisionBoundaryKey?: string | null;
    question: string;
}): string {
    const explicit = cleanOptionalString(params.decisionBoundaryKey);
    if (explicit) return explicit;
    return slugifyBoundary(params.question);
}

function optionIdFor(label: string, index: number): string {
    const slug = slugifyBoundary(label).slice(0, 60);
    return slug || `option-${index + 1}`;
}

function normalizeOptions(options: UserInputOption[] | undefined): DecisionOption[] | undefined {
    if (!options?.length) return undefined;
    return options.map((option, index) => ({
        optionId: cleanOptionalString(option.optionId) ?? optionIdFor(option.label, index),
        label: option.label,
        ...(cleanOptionalString(option.description) ? { description: cleanOptionalString(option.description) } : {}),
        ...(cleanOptionalString(option.impact) ? { impact: cleanOptionalString(option.impact) } : {}),
        ...(option.isRecommended === true ? { isRecommended: true } : {}),
        ...(cleanOptionalString(option.recommendedReason) ? { recommendedReason: cleanOptionalString(option.recommendedReason) } : {}),
    }));
}

function mirrorDecisionOptions(options: DecisionOption[] | undefined): UserInputOption[] | undefined {
    if (!options?.length) return undefined;
    return options.map((option) => ({
        optionId: option.optionId,
        label: option.label,
        ...(option.description ? { description: option.description } : {}),
        ...(option.impact ? { impact: option.impact } : {}),
        ...(option.isRecommended === true ? { isRecommended: true } : {}),
        ...(option.recommendedReason ? { recommendedReason: option.recommendedReason } : {}),
    }));
}

function recommendedOptionIdFromRequest(
    recommendedAnswer: string | undefined,
    options: DecisionOption[] | undefined,
): string | undefined {
    const normalized = cleanOptionalString(recommendedAnswer)?.toLowerCase();
    if (!normalized || !options?.length) return undefined;
    return options.find((option) => option.label.trim().toLowerCase() === normalized)?.optionId;
}

function buildPrimaryDecisionQuestion(request: UserInputRequest): DecisionQuestion {
    const questionId = resolveUserInputQuestionId(request.questionId, request.callId);
    const inputOptions = request.questionType === "yes_no" && !request.options?.length
        ? [{ label: "Yes" }, { label: "No" }]
        : request.options;
    const options = normalizeOptions(inputOptions);
    return {
        questionId,
        header: cleanOptionalString(request.header),
        prompt: request.question,
        responseKind: request.questionType,
        required: true,
        allowNote: request.questionType !== "free_text",
        allowOther: false,
        isSecret: false,
        recommendedOptionId: recommendedOptionIdFromRequest(request.recommendedAnswer, options),
        options,
    };
}

function normalizeDecisionQuestion(question: DecisionQuestion, callId: string, index: number): DecisionQuestion {
    const questionId = cleanOptionalString(question.questionId)
        ?? (index === 0 ? buildPrimaryUserInputQuestionId(callId) : `${callId}:question-${index + 1}`);
    const prompt = question.prompt.trim();
    if (!prompt) {
        throw new Error("Decision question prompt cannot be empty.");
    }
    return {
        ...question,
        questionId,
        header: cleanOptionalString(question.header),
        prompt,
        required: question.required !== false,
        allowNote: question.allowNote !== false,
        allowOther: question.allowOther === true,
        isSecret: question.isSecret === true,
        recommendedOptionId: cleanOptionalString(question.recommendedOptionId),
        options: question.options?.map((option, optionIndex) => ({
            optionId: cleanOptionalString(option.optionId) ?? optionIdFor(option.label, optionIndex),
            label: option.label,
            ...(cleanOptionalString(option.description) ? { description: cleanOptionalString(option.description) } : {}),
            ...(cleanOptionalString(option.impact) ? { impact: cleanOptionalString(option.impact) } : {}),
            ...(option.isRecommended === true ? { isRecommended: true } : {}),
            ...(cleanOptionalString(option.recommendedReason) ? { recommendedReason: cleanOptionalString(option.recommendedReason) } : {}),
        })),
    };
}

function normalizeDecisionRequest(params: {
    request: DecisionRequest;
    sourceRunId?: string | null;
    rootRunId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    userId?: string | null;
    studyId?: string | null;
    status?: DecisionRequestStatus;
}): DecisionRequest {
    const callId = params.request.callId;
    if (params.request.questions.length > 3) {
        throw new Error("Decision request cannot contain more than three questions.");
    }
    const questions = params.request.questions
        .map((question, index) => normalizeDecisionQuestion(question, callId, index));
    const primary = questions[0];
    if (!primary) {
        throw new Error("Decision request must contain at least one question.");
    }
    const decisionBoundaryKey = resolveDecisionBoundaryKeyFromQuestion({
        decisionBoundaryKey: params.request.decisionBoundaryKey,
        question: primary.prompt,
    });

    return {
        ...params.request,
        id: cleanOptionalString(params.request.id) ?? callId,
        callId,
        sourceRunId: cleanOptionalString(params.sourceRunId ?? params.request.sourceRunId),
        rootRunId: cleanOptionalString(params.rootRunId ?? params.request.rootRunId),
        conversationId: cleanOptionalString(params.conversationId ?? params.request.conversationId),
        projectId: cleanOptionalString(params.projectId ?? params.request.projectId),
        userId: cleanOptionalString(params.userId ?? params.request.userId),
        studyId: cleanOptionalString(params.studyId ?? params.request.studyId),
        decisionBoundaryKey,
        decisionKind: cleanOptionalString(params.request.decisionKind) ?? DEFAULT_DECISION_KIND,
        blockingLevel: params.request.blockingLevel ?? "blocking",
        whyThisDecisionIsNeeded: cleanOptionalString(params.request.whyThisDecisionIsNeeded),
        whatChangesIfYouChooseDifferently: cleanOptionalString(params.request.whatChangesIfYouChooseDifferently),
        recommendedPathSummary: cleanOptionalString(params.request.recommendedPathSummary),
        recommendedPathReason: cleanOptionalString(params.request.recommendedPathReason),
        status: params.status ?? params.request.status ?? "pending",
        questions,
    };
}

export function buildDecisionRequestFromUserInput(params: {
    request: UserInputRequest;
    sourceRunId?: string | null;
    rootRunId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    userId?: string | null;
    studyId?: string | null;
    status?: DecisionRequestStatus;
}): DecisionRequest {
    if (params.request.decisionRequest) {
        return normalizeDecisionRequest({
            request: params.request.decisionRequest,
            sourceRunId: params.sourceRunId ?? params.request.sourceRunId,
            rootRunId: params.rootRunId,
            conversationId: params.conversationId,
            projectId: params.projectId,
            userId: params.userId,
            studyId: params.studyId,
            status: params.status,
        });
    }

    const decisionBoundaryKey = resolveDecisionBoundaryKeyFromQuestion({
        decisionBoundaryKey: params.request.decisionBoundaryKey,
        question: params.request.question,
    });
    return {
        id: params.request.callId,
        callId: params.request.callId,
        sourceRunId: cleanOptionalString(params.sourceRunId ?? params.request.sourceRunId),
        rootRunId: cleanOptionalString(params.rootRunId),
        conversationId: cleanOptionalString(params.conversationId),
        projectId: cleanOptionalString(params.projectId),
        userId: cleanOptionalString(params.userId),
        studyId: cleanOptionalString(params.studyId),
        decisionBoundaryKey,
        decisionKind: DEFAULT_DECISION_KIND,
        blockingLevel: "blocking",
        whyThisDecisionIsNeeded: cleanOptionalString(params.request.context),
        recommendedPathSummary: cleanOptionalString(params.request.recommendedAnswer),
        recommendedPathReason: cleanOptionalString(params.request.recommendedReason),
        status: params.status ?? "pending",
        questions: [buildPrimaryDecisionQuestion(params.request)],
    };
}

export function buildUserInputRequestFromDecisionRequest(decisionRequest: DecisionRequest): UserInputRequest {
    const primaryQuestion = decisionRequest.questions[0];
    if (!primaryQuestion) {
        throw new Error("Decision request must contain at least one question.");
    }

    return {
        callId: decisionRequest.callId,
        questionId: primaryQuestion.questionId,
        sourceRunId: decisionRequest.sourceRunId,
        question: primaryQuestion.prompt,
        questionType: primaryQuestion.responseKind,
        options: mirrorDecisionOptions(primaryQuestion.options),
        header: primaryQuestion.header,
        context: decisionRequest.whyThisDecisionIsNeeded,
        decisionBoundaryKey: decisionRequest.decisionBoundaryKey,
        recommendedAnswer: decisionRequest.recommendedPathSummary,
        recommendedReason: decisionRequest.recommendedPathReason,
        decisionRequest,
    };
}

export function normalizeUserInputRequestWithDecisionRequest(params: {
    request: UserInputRequest;
    sourceRunId?: string | null;
    rootRunId?: string | null;
    conversationId?: string | null;
    projectId?: string | null;
    userId?: string | null;
    studyId?: string | null;
    status?: DecisionRequestStatus;
}): UserInputRequest {
    const decisionRequest = buildDecisionRequestFromUserInput(params);
    return {
        ...buildUserInputRequestFromDecisionRequest(decisionRequest),
        answered: params.request.answered,
        answer: params.request.answer,
        resolution: params.request.resolution,
    };
}

function mapUserInputResolutionKind(kind: UserInputResolutionKind): DecisionResolutionKind {
    if (kind === "accept_recommended") return "accepted_recommended";
    return kind;
}

function selectedOptionIdsFromLabels(
    labels: string[] | undefined,
    question: DecisionQuestion,
): string[] | undefined {
    if (!labels?.length || !question.options?.length) return undefined;
    const byLabel = new Map(question.options.map((option) => [option.label.trim().toLowerCase(), option.optionId]));
    const optionIds = labels
        .map((label) => byLabel.get(label.trim().toLowerCase()))
        .filter((optionId): optionId is string => Boolean(optionId));
    return optionIds.length > 0 ? optionIds : undefined;
}

function buildPrimaryDecisionAnswer(params: {
    request: DecisionRequest;
    resolution: UserInputResolution;
}): DecisionAnswer {
    const question = params.request.questions[0];
    const answerText = cleanOptionalString(params.resolution.answerText);
    const selectedOptionIds = selectedOptionIdsFromLabels(
        params.resolution.selectedOptions?.length ? params.resolution.selectedOptions : answerText ? [answerText] : undefined,
        question,
    );
    if (params.resolution.resolution === "accept_recommended") {
        return {
            questionId: question.questionId,
            selectedOptionIds: question.recommendedOptionId ? [question.recommendedOptionId] : undefined,
            freeText: params.request.recommendedPathSummary,
            note: params.request.recommendedPathReason,
        };
    }
    if (question.responseKind === "free_text") {
        return {
            questionId: question.questionId,
            ...(answerText ? { freeText: answerText } : {}),
        };
    }
    return {
        questionId: question.questionId,
        ...(selectedOptionIds ? { selectedOptionIds } : {}),
        ...(answerText ? { note: answerText } : {}),
        ...(!selectedOptionIds && answerText ? { freeText: answerText } : {}),
    };
}

export function buildDecisionResolutionFromUserInput(params: {
    request: UserInputRequest;
    resolution: UserInputResolution;
}): DecisionResolution {
    const decisionRequest = buildDecisionRequestFromUserInput({
        request: params.request,
        sourceRunId: params.resolution.sourceRunId,
        status: "pending",
    });
    const answers = params.resolution.answers?.length
        ? params.resolution.answers
        : [buildPrimaryDecisionAnswer({ request: decisionRequest, resolution: params.resolution })];

    return {
        requestId: decisionRequest.id,
        callId: params.resolution.callId,
        sourceRunId: params.resolution.sourceRunId,
        resolutionKind: mapUserInputResolutionKind(params.resolution.resolution),
        answers,
        answeredAt: params.resolution.answeredAt,
        decisionBoundaryKey: params.resolution.decisionBoundaryKey ?? decisionRequest.decisionBoundaryKey,
    };
}
