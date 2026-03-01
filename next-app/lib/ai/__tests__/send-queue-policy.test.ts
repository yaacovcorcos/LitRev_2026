import { describe, expect, it } from "vitest";
import {
    resolveMaxQueuedMessages,
    resolveSendQueueMode,
} from "@/lib/ai/send-queue-policy";

describe("send queue policy", () => {
    it("defaults queue mode to queue", () => {
        expect(resolveSendQueueMode(undefined)).toBe("queue");
        expect(resolveSendQueueMode("")).toBe("queue");
        expect(resolveSendQueueMode("unknown")).toBe("queue");
    });

    it("supports explicit interrupt mode", () => {
        expect(resolveSendQueueMode("interrupt")).toBe("interrupt");
        expect(resolveSendQueueMode("INTERRUPT")).toBe("interrupt");
    });

    it("parses max queued messages with sane defaults and cap", () => {
        expect(resolveMaxQueuedMessages(undefined)).toBe(3);
        expect(resolveMaxQueuedMessages("abc")).toBe(3);
        expect(resolveMaxQueuedMessages("0")).toBe(3);
        expect(resolveMaxQueuedMessages("2")).toBe(2);
        expect(resolveMaxQueuedMessages("200")).toBe(20);
    });
});
