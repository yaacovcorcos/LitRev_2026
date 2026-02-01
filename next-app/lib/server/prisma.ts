import "server-only";

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";

const pool = new Pool({
  connectionString: DATABASE_URL.replace('&sslmode=require', '&sslmode=no-verify'),
  // Optimize for remote database with high latency
  connectionTimeoutMillis: 30000,  // 30s connection timeout
  idleTimeoutMillis: 30000,        // Close idle connections after 30s
  max: 10,                          // Max 10 connections in pool
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
