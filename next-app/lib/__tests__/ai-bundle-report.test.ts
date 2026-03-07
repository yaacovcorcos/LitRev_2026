import { describe, expect, it } from "vitest";
import { extractAiBundleAssetPaths } from "../ai-bundle-report";

describe("extractAiBundleAssetPaths", () => {
    it("deduplicates preload and script assets from ai html", () => {
        const html = `
            <link rel="preload" as="script" href="/_next/static/chunks/a.js" />
            <script src="/_next/static/chunks/a.js" async=""></script>
            <script src="/_next/static/chunks/b.js" async=""></script>
            <script src="https://example.com/ignore.js" async=""></script>
            <link rel="stylesheet" href="/_next/static/chunks/styles.css" />
        `;

        expect(extractAiBundleAssetPaths(html)).toEqual([
            "static/chunks/a.js",
            "static/chunks/b.js",
        ]);
    });
});
