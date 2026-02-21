/**
 * Precompute semantic memory embeddings for faster first-query retrieval.
 *
 * Usage:
 *   npx tsx scripts/warmup-memory-embeddings.ts
 *   npx tsx scripts/warmup-memory-embeddings.ts --projectId=<projectId>
 *   npx tsx scripts/warmup-memory-embeddings.ts --projectId=<projectId> --userId=<userId>
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { prisma } from "../lib/server/prisma";
import { warmupSemanticEmbeddings } from "../lib/server/memory/semantic-memory";

function parseArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const arg = process.argv.find((v) => v.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
}

async function main() {
    const projectId = parseArg("projectId");
    const userId = parseArg("userId") || "single-user";

    const projects = projectId
        ? await prisma.project.findMany({
            where: { id: projectId },
            select: { id: true },
        })
        : await prisma.project.findMany({
            select: { id: true },
            orderBy: { created: "asc" },
        });

    if (projects.length === 0) {
        console.log("No projects found for embedding warmup.");
        return;
    }

    let totalScanned = 0;
    let totalIndexed = 0;
    let model = "";

    for (const project of projects) {
        const result = await warmupSemanticEmbeddings(
            {
                userId,
                projectId: project.id,
            },
            {
                includeUser: true,
                includeProject: true,
                includeStudy: true,
            },
        );

        totalScanned += result.scanned;
        totalIndexed += result.indexed;
        model = result.model;
        console.log(`project=${project.id} scanned=${result.scanned} indexed=${result.indexed} model=${result.model}`);
    }

    console.log(`Warmup complete: projects=${projects.length} scanned=${totalScanned} indexed=${totalIndexed} model=${model}`);
}

main()
    .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Warmup failed: ${message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => {});
    });
