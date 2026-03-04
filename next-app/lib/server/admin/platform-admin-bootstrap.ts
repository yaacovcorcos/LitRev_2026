import "server-only";

import { prisma } from "@/lib/server/prisma";

export const PLATFORM_ADMIN_BOOTSTRAP_EMAIL_ENV = "PLATFORM_ADMIN_BOOTSTRAP_EMAIL";

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function resolveBootstrapEmail(email?: string): string {
  const resolved = email?.trim() || process.env[PLATFORM_ADMIN_BOOTSTRAP_EMAIL_ENV]?.trim() || "";
  if (!resolved) {
    throw new Error(
      `Missing bootstrap email. Pass an email argument or set ${PLATFORM_ADMIN_BOOTSTRAP_EMAIL_ENV}.`,
    );
  }
  return resolved;
}

async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findMany({
    where: { email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, email: true, isPlatformAdmin: true, name: true },
    take: 1,
  });
  return user[0] ?? null;
}

export type BootstrapPlatformAdminResult = {
  mode: "bootstrap" | "recover";
  email: string;
  userId: string;
  alreadyAdmin: boolean;
  totalAdminsAfter: number;
};

export async function bootstrapPlatformAdmin(email?: string): Promise<BootstrapPlatformAdminResult> {
  const resolved = resolveBootstrapEmail(email);
  const target = await findUserByEmail(resolved);
  if (!target) {
    throw new Error(`No user found for email: ${resolved}`);
  }

  const adminCount = await prisma.user.count({ where: { isPlatformAdmin: true } });
  if (adminCount > 0 && !target.isPlatformAdmin) {
    throw new Error(
      "Bootstrap blocked: platform admins already exist. Use recoverPlatformAdmin for explicit recovery operations.",
    );
  }

  if (!target.isPlatformAdmin) {
    await prisma.user.update({
      where: { id: target.id },
      data: { isPlatformAdmin: true },
    });
  }

  const totalAdminsAfter = await prisma.user.count({ where: { isPlatformAdmin: true } });
  return {
    mode: "bootstrap",
    email: target.email,
    userId: target.id,
    alreadyAdmin: target.isPlatformAdmin,
    totalAdminsAfter,
  };
}

export async function recoverPlatformAdmin(email?: string): Promise<BootstrapPlatformAdminResult> {
  const resolved = resolveBootstrapEmail(email);
  const target = await findUserByEmail(resolved);
  if (!target) {
    throw new Error(`No user found for email: ${resolved}`);
  }

  if (!target.isPlatformAdmin) {
    await prisma.user.update({
      where: { id: target.id },
      data: { isPlatformAdmin: true },
    });
  }

  const totalAdminsAfter = await prisma.user.count({ where: { isPlatformAdmin: true } });
  return {
    mode: "recover",
    email: target.email,
    userId: target.id,
    alreadyAdmin: target.isPlatformAdmin,
    totalAdminsAfter,
  };
}
