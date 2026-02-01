import "server-only";
import { prisma } from "./prisma";

export async function testConnection() {
  try {
    await prisma.$connect();
    const count = await prisma.user.count();
    return { success: true, userCount: count };
  } catch (error) {
    console.error("Database connection failed:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    await prisma.$disconnect();
  }
}
