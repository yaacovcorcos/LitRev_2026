// Load .env.local for Prisma CLI (does NOT override already-set env vars).
// In CI/deploy, DATABASE_URL is set in the environment and takes precedence.
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { defineConfig } from "prisma/config";

const databaseUrl = process.env["DATABASE_URL"];
const directUrl = process.env["DIRECT_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // directUrl bypasses pgbouncer/pooler for migrations - much faster
    url: directUrl || databaseUrl,
  },
});
