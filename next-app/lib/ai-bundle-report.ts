import fs from "node:fs";
import path from "node:path";

export type AiBundleChunk = {
    assetPath: string;
    bytes: number;
};

export type AiBundleReport = {
    htmlPath: string;
    chunkCount: number;
    totalBytes: number;
    chunks: AiBundleChunk[];
};

const SCRIPT_SRC_RE = /<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"[^>]*(?:as="script")?[^>]*>/gi;

export function extractAiBundleAssetPaths(html: string): string[] {
    const assets = new Set<string>();
    for (const match of html.matchAll(SCRIPT_SRC_RE)) {
        const assetPath = match[1];
        if (!assetPath.startsWith("/_next/static/")) continue;
        if (!assetPath.endsWith(".js")) continue;
        assets.add(assetPath.replace(/^\/_next\//, ""));
    }
    return [...assets];
}

export function buildAiBundleReport(nextAppRoot: string): AiBundleReport {
    const htmlPath = path.join(nextAppRoot, ".next/server/app/ai.html");
    const html = fs.readFileSync(htmlPath, "utf8");
    const assetPaths = extractAiBundleAssetPaths(html);
    const chunks = assetPaths.map((assetPath) => {
        const filePath = path.join(nextAppRoot, ".next", assetPath);
        return {
            assetPath,
            bytes: fs.statSync(filePath).size,
        };
    });
    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);

    return {
        htmlPath,
        chunkCount: chunks.length,
        totalBytes,
        chunks,
    };
}
