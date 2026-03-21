import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { logServerWarn } from "@/lib/server/logging";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isLocalDb = DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");
const isSupabasePooler = DATABASE_URL.includes(".pooler.supabase.com");
const allowInsecureDbTls = process.env.ALLOW_INSECURE_DB_TLS === "1";

function readPositiveIntegerEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  logServerWarn("db", "ignoring invalid environment value", { name, raw });
  return undefined;
}

function withNoVerifySsl(url: string): string {
  if (url.includes("sslmode=no-verify")) return url;
  if (url.includes("sslmode=require")) return url.replace("sslmode=require", "sslmode=no-verify");
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=no-verify`;
}

const poolConnectionString = (() => {
  if (!DATABASE_URL) return DATABASE_URL;

  if (isSupabasePooler && allowInsecureDbTls) {
    if (process.env.NODE_ENV === "production") {
      logServerWarn(
        "db",
        "ALLOW_INSECURE_DB_TLS=1 is enabled in production; this should be temporary emergency mode only",
      );
    }
    return withNoVerifySsl(DATABASE_URL);
  }

  if (process.env.NODE_ENV === "production" && DATABASE_URL.includes("sslmode=no-verify")) {
    throw new Error(
      "Insecure DB TLS detected in production DATABASE_URL. Remove sslmode=no-verify or set ALLOW_INSECURE_DB_TLS=1 explicitly for temporary emergency use.",
    );
  }

  return DATABASE_URL;
})();

const defaultConnectionTimeoutMs = isLocalDb ? 10000 : 30000;
const defaultIdleTimeoutMs = 30000;
const defaultPoolMax = 10;

const pool = new Pool({
  connectionString: poolConnectionString,
  connectionTimeoutMillis: readPositiveIntegerEnv("PRISMA_POOL_CONNECTION_TIMEOUT_MS") ?? defaultConnectionTimeoutMs,
  idleTimeoutMillis: readPositiveIntegerEnv("PRISMA_POOL_IDLE_TIMEOUT_MS") ?? defaultIdleTimeoutMs,
  max: readPositiveIntegerEnv("PRISMA_POOL_MAX") ?? defaultPoolMax,
});

const adapter = new PrismaPg(pool);

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
