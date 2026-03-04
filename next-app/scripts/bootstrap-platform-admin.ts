/**
 * One-off utility for platform admin bootstrap and recovery.
 *
 * Usage examples:
 * 1) First bootstrap (fails if admins already exist):
 *    npx tsx scripts/bootstrap-platform-admin.ts --mode bootstrap --email coryacos1@gmail.com
 *
 * 2) Recovery (can grant admin even when admins already exist):
 *    npx tsx scripts/bootstrap-platform-admin.ts --mode recover --email coryacos1@gmail.com
 *
 * 3) Using env fallback:
 *    PLATFORM_ADMIN_BOOTSTRAP_EMAIL=coryacos1@gmail.com npx tsx scripts/bootstrap-platform-admin.ts --mode bootstrap
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { prisma } from "../lib/server/prisma";
import {
  bootstrapPlatformAdmin,
  recoverPlatformAdmin,
} from "../lib/server/admin/platform-admin-bootstrap";

type Mode = "bootstrap" | "recover";

function parseArgs(argv: string[]): { mode: Mode; email?: string } {
  let mode: Mode = "bootstrap";
  let email: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (current === "--mode") {
      const candidate = argv[i + 1];
      if (candidate === "bootstrap" || candidate === "recover") {
        mode = candidate;
        i += 1;
        continue;
      }
      throw new Error("Invalid --mode. Expected 'bootstrap' or 'recover'.");
    }
    if (current === "--email") {
      const candidate = argv[i + 1];
      if (!candidate || candidate.startsWith("--")) {
        throw new Error("Missing value for --email.");
      }
      email = candidate;
      i += 1;
      continue;
    }
  }

  return { mode, email };
}

async function main() {
  const { mode, email } = parseArgs(process.argv.slice(2));

  if (mode === "bootstrap") {
    const result = await bootstrapPlatformAdmin(email);
    console.log(
      `[admin-bootstrap] mode=${result.mode} email=${result.email} userId=${result.userId} alreadyAdmin=${result.alreadyAdmin} totalAdminsAfter=${result.totalAdminsAfter}`,
    );
    return;
  }

  const result = await recoverPlatformAdmin(email);
  console.log(
    `[admin-bootstrap] mode=${result.mode} email=${result.email} userId=${result.userId} alreadyAdmin=${result.alreadyAdmin} totalAdminsAfter=${result.totalAdminsAfter}`,
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin-bootstrap] failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
