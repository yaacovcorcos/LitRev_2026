import "server-only";

import { prisma } from "@/lib/server/prisma";
import {
  getAuthContext,
  requireApiSession,
  type AuthContext,
} from "@/lib/server/auth/session";

export class PlatformAdminAccessError extends Error {
  readonly status: number;

  constructor(message = "Forbidden: platform admin access required") {
    super(message);
    this.name = "PlatformAdminAccessError";
    this.status = 403;
  }
}

export type PlatformAdminContext = AuthContext & { isPlatformAdmin: true };

async function ensurePlatformAdminByUserId(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });

  if (!user?.isPlatformAdmin) {
    throw new PlatformAdminAccessError();
  }
}

export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const context = await getAuthContext();
  await ensurePlatformAdminByUserId(context.userId);
  return { ...context, isPlatformAdmin: true };
}

export async function withPlatformAdminAction<T>(
  fn: (context: PlatformAdminContext) => Promise<T>,
): Promise<T> {
  const context = await requirePlatformAdmin();
  return fn(context);
}

export async function requirePlatformAdminApi(
  request: Request,
): Promise<{ ok: true; context: PlatformAdminContext } | { ok: false; response: Response }> {
  const authResult = await requireApiSession(request);
  if (!authResult.ok) {
    return authResult;
  }

  try {
    await ensurePlatformAdminByUserId(authResult.context.userId);
  } catch (error) {
    if (error instanceof PlatformAdminAccessError) {
      return {
        ok: false,
        response: Response.json({ error: error.message }, { status: 403 }),
      };
    }
    throw error;
  }

  return {
    ok: true,
    context: { ...authResult.context, isPlatformAdmin: true },
  };
}

export async function requirePlatformAdminBackground(userId: string): Promise<void> {
  await ensurePlatformAdminByUserId(userId);
}
