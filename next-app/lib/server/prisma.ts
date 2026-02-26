import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";
const isLocalDb = DATABASE_URL.includes("localhost") || DATABASE_URL.includes("127.0.0.1");
const isSupabasePooler = DATABASE_URL.includes(".pooler.supabase.com");

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Supabase pooler commonly presents a cert chain that Node's default
  // verification rejects in serverless runtimes; disable strict validation
  // only for that host pattern to keep auth/db flows functional.
  ssl: !isLocalDb && isSupabasePooler ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: isLocalDb ? 5000 : 30000,
  idleTimeoutMillis: isLocalDb ? 10000 : 30000,
  max: 10,
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
