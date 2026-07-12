import { config } from "dotenv";

config({ path: ".env.local" });
config();

import {
    SELECTABLE_MODEL_IDS,
    getDefaultReasoningEffort,
    getProviderForModel,
    getProviderModelId,
    modelSupportsDeliveryMode,
} from "../lib/ai/config";
import { getModelAvailabilityMap } from "../lib/server/ai/model-availability";
import {
    getGatewayProvider,
    getOpenAIProvider,
    getXAIProvider,
} from "../lib/server/ai/providers";
import type { BaseAIProvider } from "../lib/server/ai/providers";
import type {
    AIMessage,
    AIStreamChunk,
    DeliveryMode,
    ToolCall,
} from "../types/ai";

const LIVE_SMOKE_FLAG = "RUN_AI_MODEL_PORTFOLIO_SMOKE";
const REQUIRE_ALL_FLAG = "REQUIRE_ALL_SELECTABLE_AI_MODELS";
const PRIORITY_SMOKE_FLAG = "RUN_AI_PRIORITY_SMOKE";
const REQUEST_TIMEOUT_MS = 45_000;

const smokeTool = {
    name: "smoke_probe",
    description: "A no-op diagnostic tool. Do not call it unless the prompt asks you to.",
    parameters: {
        type: "object",
        properties: {
            value: { type: "string" },
        },
        required: ["value"],
        additionalProperties: false,
    },
};

function providerForModel(modelId: string): BaseAIProvider {
    const provider = getProviderForModel(modelId);
    if (provider === "openai") return getOpenAIProvider();
    if (provider === "xai") return getXAIProvider();
    if (provider === "gateway") return getGatewayProvider();
    throw new Error(`[${modelId}] unsupported selectable provider ${String(provider)}`);
}

function createSmokeMessage(modelId: string): AIMessage {
    return {
        id: `portfolio-smoke-${modelId}`,
        role: "user",
        content: "Call smoke_probe exactly once with value READY. After the tool result, reply with exactly READY.",
        createdAt: new Date().toISOString(),
    };
}

type ProviderTurn = {
    content: string;
    done: AIStreamChunk;
    toolCalls: ToolCall[];
    providerReasoningContent?: string;
};

async function collectProviderTurn(params: {
    modelId: string;
    deliveryMode: DeliveryMode;
    messages: AIMessage[];
}): Promise<ProviderTurn> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let doneChunk: AIStreamChunk | null = null;
    let content = "";
    const toolCalls: ToolCall[] = [];

    try {
        const stream = providerForModel(params.modelId).streamChat(
            params.messages,
            {
                model: params.modelId,
                reasoningEffort: getDefaultReasoningEffort(params.modelId),
                deliveryMode: params.deliveryMode,
                maxTokens: 512,
                tools: [smokeTool],
                signal: controller.signal,
            },
        );

        for await (const chunk of stream) {
            if (chunk.type === "error") {
                throw new Error(chunk.errorMeta?.message ?? chunk.error ?? "provider stream failed");
            }
            if (chunk.type === "content" && chunk.content) content += chunk.content;
            if (chunk.type === "tool_call" && chunk.toolCall) toolCalls.push(chunk.toolCall);
            if (chunk.type === "done") doneChunk = chunk;
        }
    } finally {
        clearTimeout(timeout);
    }

    if (!doneChunk) throw new Error(`[${params.modelId}] stream ended without a done receipt`);
    return {
        content,
        done: doneChunk,
        toolCalls,
        providerReasoningContent: doneChunk.providerReasoningContent,
    };
}

async function runModelSmoke(modelId: string, deliveryMode: DeliveryMode): Promise<AIStreamChunk> {
    const userMessage = createSmokeMessage(modelId);
    const toolTurn = await collectProviderTurn({
        modelId,
        deliveryMode,
        messages: [userMessage],
    });
    if (toolTurn.toolCalls.length !== 1) {
        throw new Error(`[${modelId}] expected exactly one smoke_probe call, received ${toolTurn.toolCalls.length}`);
    }
    const toolCall = toolTurn.toolCalls[0];
    if (toolCall.name !== smokeTool.name || toolCall.arguments.value !== "READY") {
        throw new Error(`[${modelId}] returned an invalid smoke_probe call`);
    }

    const finalTurn = await collectProviderTurn({
        modelId,
        deliveryMode,
        messages: [
            userMessage,
            {
                id: `portfolio-smoke-assistant-${modelId}`,
                role: "assistant",
                content: toolTurn.content,
                toolCalls: toolTurn.toolCalls,
                providerReasoningContent: toolTurn.providerReasoningContent,
                createdAt: new Date().toISOString(),
            },
            {
                id: `portfolio-smoke-tool-${modelId}`,
                role: "tool",
                content: "READY",
                toolResultId: toolCall.id,
                createdAt: new Date().toISOString(),
            },
        ],
    });
    if (finalTurn.toolCalls.length > 0) {
        throw new Error(`[${modelId}] called smoke_probe again after receiving its result`);
    }
    if (finalTurn.content.trim() !== "READY") {
        throw new Error(`[${modelId}] expected the exact final answer READY`);
    }
    return finalTurn.done;
}

function assertReceiptMatchesRoute(modelId: string, receipt: AIStreamChunk) {
    const expectedModel = getProviderModelId(modelId);
    if (!expectedModel || receipt.actualModel !== expectedModel) {
        throw new Error(
            `[${modelId}] expected actual model ${expectedModel ?? "configured route"}, received ${receipt.actualModel ?? "unreported"}`,
        );
    }

    const route = getProviderForModel(modelId);
    if (!route) {
        throw new Error(`[${modelId}] has no configured provider route`);
    }
    const expectedProviders: readonly string[] = route === "gateway"
        ? modelId.startsWith("deepseek-") ? ["deepseek"] : ["alibaba"]
        : [route];
    if (!receipt.actualProvider || !expectedProviders.includes(receipt.actualProvider)) {
        throw new Error(
            `[${modelId}] expected provider ${expectedProviders.join(" or ")}, received ${receipt.actualProvider ?? "unreported"}`,
        );
    }
}

async function main() {
    if (process.env[LIVE_SMOKE_FLAG] !== "1") {
        throw new Error(`Live model smoke is opt-in. Set ${LIVE_SMOKE_FLAG}=1.`);
    }

    const availability = getModelAvailabilityMap();
    const unavailable = SELECTABLE_MODEL_IDS.filter((modelId) => !availability[modelId]?.configured);
    if (unavailable.length > 0 && process.env[REQUIRE_ALL_FLAG] === "1") {
        throw new Error(`Selectable production models are unavailable: ${unavailable.join(", ")}`);
    }

    console.log("Running selectable AI model portfolio smoke");
    for (const modelId of SELECTABLE_MODEL_IDS) {
        const modelAvailability = availability[modelId];
        if (!modelAvailability?.configured) {
            console.log(`- ${modelId}: skipped (${modelAvailability?.unavailableReason ?? "not configured"})`);
            continue;
        }

        const receipt = await runModelSmoke(modelId, "standard");
        assertReceiptMatchesRoute(modelId, receipt);
        console.log(
            `- ${modelId}: standard passed; actualModel=${receipt.actualModel ?? "unreported"}; actualProvider=${receipt.actualProvider ?? "unreported"}`,
        );

        if (process.env[PRIORITY_SMOKE_FLAG] === "1" && modelSupportsDeliveryMode(modelId, "priority")) {
            const priorityReceipt = await runModelSmoke(modelId, "priority");
            assertReceiptMatchesRoute(modelId, priorityReceipt);
            if (priorityReceipt.actualDeliveryMode !== "priority") {
                throw new Error(
                    `[${modelId}] priority was requested but the provider reported ${priorityReceipt.actualDeliveryMode ?? "no delivery tier"}`,
                );
            }
            console.log(`- ${modelId}: priority passed with provider-confirmed receipt`);
        }
    }
}

main().catch((error) => {
    console.error("[smoke-ai-model-portfolio] failed", error);
    process.exitCode = 1;
});
