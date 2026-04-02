// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { createDefaultProtocolData } from "@/types/protocol";
import {
    loadProtocolData,
    loadProtocolStorageEntry,
    saveProtocolStorageEntry,
} from "@/lib/protocol-storage";

const PROJECT_ID = "proj-protocol-storage";
const STORAGE_KEY = `litrev_protocol_v2:${PROJECT_ID}`;

describe("protocolStorage", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    it("reads legacy raw protocol payloads", () => {
        const legacyProtocol = {
            ...createDefaultProtocolData(),
            researchQuestion: "Legacy question",
            searchStrategy: {
                query: "legacy query",
                databases: ["PubMed"],
            },
        };

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyProtocol));

        expect(loadProtocolData(PROJECT_ID)).toEqual(legacyProtocol);
        expect(loadProtocolStorageEntry(PROJECT_ID)).toEqual({
            version: 1,
            savedAtMs: 0,
            lastSyncedAtMs: 0,
            source: "legacy",
            protocol: legacyProtocol,
        });
    });

    it("round-trips metadata envelopes", () => {
        const protocol = {
            ...createDefaultProtocolData(),
            researchQuestion: "Round trip question",
        };

        saveProtocolStorageEntry(PROJECT_ID, {
            protocol,
            savedAtMs: 111,
            lastSyncedAtMs: 77,
            source: "editor",
        });

        expect(loadProtocolStorageEntry(PROJECT_ID)).toEqual({
            version: 1,
            savedAtMs: 111,
            lastSyncedAtMs: 77,
            source: "editor",
            protocol,
        });
    });
});
