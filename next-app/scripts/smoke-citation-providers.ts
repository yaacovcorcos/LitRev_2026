import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { resolveCitationMetadata } from "../lib/server/citation-metadata";

type Fixture = {
    label: string;
    url: string;
    expectedPrefix: "pubmed_" | "doi_";
};

const fixtures: Fixture[] = [
    {
        label: "pubmed_primary",
        url: process.env.CITATION_SMOKE_PUBMED_URL ?? "https://pubmed.ncbi.nlm.nih.gov/31452104/",
        expectedPrefix: "pubmed_",
    },
    {
        label: "pubmed_secondary",
        url: process.env.CITATION_SMOKE_PUBMED_WITH_DOI_URL ?? "https://pubmed.ncbi.nlm.nih.gov/2553535/",
        expectedPrefix: "pubmed_",
    },
    {
        label: "doi_primary",
        url: process.env.CITATION_SMOKE_DOI_URL ?? "https://doi.org/10.1038/s41586-020-2649-2",
        expectedPrefix: "doi_",
    },
];

async function main() {
    if (process.env.RUN_CITATION_PROVIDER_TESTS !== "1") {
        throw new Error(
            "Provider smoke is opt-in. Re-run with RUN_CITATION_PROVIDER_TESTS=1.",
        );
    }

    console.log("Running citation provider compatibility smoke");

    for (const fixture of fixtures) {
        const resolution = await resolveCitationMetadata(fixture.url);
        if (!resolution) {
            throw new Error(`[${fixture.label}] resolver returned null`);
        }

        if (!resolution.diagnostics.resolutionPath.startsWith(fixture.expectedPrefix)) {
            throw new Error(
                `[${fixture.label}] unexpected resolution path ${resolution.diagnostics.resolutionPath}`,
            );
        }

        if (!resolution.metadata.title || !resolution.metadata.authors) {
            throw new Error(`[${fixture.label}] missing core bibliography fields`);
        }

        console.log(
            `- ${fixture.label}: path=${resolution.diagnostics.resolutionPath} reason=${resolution.diagnostics.reason} title=${resolution.metadata.title}`,
        );
    }
}

main().catch((error) => {
    console.error("[smoke-citation-providers] failed", error);
    process.exitCode = 1;
});
