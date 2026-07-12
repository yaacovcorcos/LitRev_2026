import { describe, expect, it } from "vitest";

import {
    REASONING_EFFORT_STORAGE_KEY,
    createGenerationPreferenceSnapshot,
    readStoredReasoningEffort,
    readStoredSelectableModel,
    writeStoredReasoningEffort,
} from "../generation-preferences";

function createStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        read: (key: string) => values.get(key) ?? null,
    };
}

describe("generation preferences", () => {
    it("replaces retired or invalid stored model ids with Luna", () => {
        const storage = createStorage({ model: "gpt-5.2" });

        expect(readStoredSelectableModel(storage, "model")).toBe("gpt-5.6-luna");
        expect(storage.read("model")).toBe("gpt-5.6-luna");
    });

    it("keeps reasoning effort independently for each model", () => {
        const storage = createStorage();

        writeStoredReasoningEffort(storage, "gpt-5.6-luna", "low");
        writeStoredReasoningEffort(storage, "deepseek-v4-pro", "max");

        expect(readStoredReasoningEffort(storage, "gpt-5.6-luna")).toBe("low");
        expect(readStoredReasoningEffort(storage, "deepseek-v4-pro")).toBe("max");
        expect(JSON.parse(storage.read(REASONING_EFFORT_STORAGE_KEY) ?? "{}")).toEqual({
            "gpt-5.6-luna": "low",
            "deepseek-v4-pro": "max",
        });
    });

    it("clamps unsupported saved effort to the model default", () => {
        const storage = createStorage({
            [REASONING_EFFORT_STORAGE_KEY]: JSON.stringify({
                "deepseek-v4-flash": "medium",
            }),
        });

        expect(readStoredReasoningEffort(storage, "deepseek-v4-flash")).toBe("fast");
        expect(JSON.parse(storage.read(REASONING_EFFORT_STORAGE_KEY) ?? "{}")).toMatchObject({
            "deepseek-v4-flash": "fast",
        });
    });

    it("keeps priority only for models that support it", () => {
        expect(createGenerationPreferenceSnapshot({
            model: "gpt-5.6-luna",
            reasoningEffort: "high",
            deliveryMode: "priority",
        })).toEqual({
            model: "gpt-5.6-luna",
            reasoningEffort: "high",
            deliveryMode: "priority",
        });

        expect(createGenerationPreferenceSnapshot({
            model: "deepseek-v4-pro",
            reasoningEffort: "low",
            deliveryMode: "priority",
        })).toEqual({
            model: "deepseek-v4-pro",
            reasoningEffort: "high",
            deliveryMode: "standard",
        });
    });
});
