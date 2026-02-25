export function normalizeHeaderRecord(input: unknown): Record<string, string> | undefined {
    if (!input || typeof input !== "object") return undefined;

    if (typeof Headers !== "undefined" && input instanceof Headers) {
        const normalized: Record<string, string> = {};
        for (const [k, v] of input.entries()) {
            normalized[k.toLowerCase()] = v;
        }
        return Object.keys(normalized).length > 0 ? normalized : undefined;
    }

    const record: Record<string, string> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
        if (typeof v === "string") {
            record[k.toLowerCase()] = v;
        } else if (typeof v === "number" && Number.isFinite(v)) {
            record[k.toLowerCase()] = String(v);
        }
    }
    return Object.keys(record).length > 0 ? record : undefined;
}
