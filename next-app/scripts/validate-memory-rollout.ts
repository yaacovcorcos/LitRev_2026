/**
 * Validate pgvector rollout prerequisites for semantic memory retrieval.
 *
 * Usage:
 *   npx tsx scripts/validate-memory-rollout.ts
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { prisma } from "../lib/server/prisma";
import { validateSemanticRolloutStatus } from "../lib/server/memory/semantic-memory";

async function main() {
    const status = await validateSemanticRolloutStatus();
    console.log(JSON.stringify(status, null, 2));
    if (!status.healthy) {
        process.exitCode = 1;
    }
}

main()
    .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Rollout validation failed: ${message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => {});
    });

