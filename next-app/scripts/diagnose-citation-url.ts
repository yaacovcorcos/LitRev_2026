import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { resolveCitationMetadata } from "../lib/server/citation-metadata";

function getUrlsFromArgs(): string[] {
    return process.argv.slice(2).map((value) => value.trim()).filter(Boolean);
}

async function main() {
    const urls = getUrlsFromArgs();
    if (urls.length === 0) {
        throw new Error(
            "Provide at least one PubMed or DOI URL. Example: npm run citation:diagnose -- https://pubmed.ncbi.nlm.nih.gov/31452104/",
        );
    }

    console.log(`Diagnosing ${urls.length} citation URL${urls.length === 1 ? "" : "s"}`);

    for (const url of urls) {
        const resolution = await resolveCitationMetadata(url);
        if (!resolution) {
            console.log(JSON.stringify({
                url,
                resolved: false,
                reason: "resolver_returned_null",
            }));
            continue;
        }

        console.log(JSON.stringify({
            url,
            resolved: true,
            title: resolution.metadata.title,
            canonicalUrl: resolution.metadata.canonicalUrl ?? null,
            pmid: resolution.metadata.pmid ?? null,
            doi: resolution.metadata.doi ?? null,
            citationCount: typeof resolution.metadata.citationCount === "number"
                ? resolution.metadata.citationCount
                : null,
            citationCountSource: resolution.metadata.citationCountSource ?? null,
            resolutionPath: resolution.diagnostics.resolutionPath,
            reason: resolution.diagnostics.reason,
            resolvedWithCitationCount: resolution.diagnostics.resolvedWithCitationCount,
            hadDoiFallbackCandidate: resolution.diagnostics.hadDoiFallbackCandidate,
        }));
    }
}

main().catch((error) => {
    console.error("[diagnose-citation-url] failed", error);
    process.exitCode = 1;
});
