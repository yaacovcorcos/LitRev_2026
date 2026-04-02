import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";

export class LastPlatformAdminError extends Error {
  constructor() {
    super("Cannot revoke platform admin from the last remaining platform admin.");
    this.name = "LastPlatformAdminError";
  }
}

export class PlatformAdminMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlatformAdminMutationError";
  }
}

export type SetPlatformAdminStatusInput = {
  actorUserId: string;
  targetUserId: string;
  makeAdmin: boolean;
  reason?: string;
  requestId?: string;
};

export type SetPlatformAdminStatusResult = {
  changed: boolean;
  targetUserId: string;
  isPlatformAdmin: boolean;
};

type PlatformAdminMutationTx = {
  user: {
    findUnique(args: {
      where: { id: string };
      select: { id: true; isPlatformAdmin: true };
    }): Promise<{ id: string; isPlatformAdmin: boolean } | null>;
    findUnique(args: {
      where: { id: string };
      select: { id: true; isPlatformAdmin: true; email: true; name: true };
    }): Promise<{ id: string; isPlatformAdmin: boolean; email: string | null; name: string | null } | null>;
    count(args: { where: { isPlatformAdmin: boolean } }): Promise<number>;
    update(args: {
      where: { id: string };
      data: { isPlatformAdmin: boolean };
    }): Promise<unknown>;
  };
  adminAuditLog: {
    create(args: {
      data: {
        actorUserId: string;
        targetUserId: string;
        action: "platform_admin_grant" | "platform_admin_revoke";
        reason: string | null;
        requestId: string | null;
        before: { isPlatformAdmin: boolean };
        after: { isPlatformAdmin: boolean };
      };
    }): Promise<unknown>;
  };
  $executeRaw: (
    strings: TemplateStringsArray | Prisma.Sql,
    ...values: readonly unknown[]
  ) => Promise<unknown>;
};

type TransactionCapableClient = {
  $transaction: <T>(
    fn: (tx: PlatformAdminMutationTx) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ) => Promise<T>;
};

export async function setPlatformAdminStatus(
  input: SetPlatformAdminStatusInput,
  client: TransactionCapableClient = prisma as unknown as TransactionCapableClient,
): Promise<SetPlatformAdminStatusResult> {
  const actorUserId = input.actorUserId.trim();
  const targetUserId = input.targetUserId.trim();

  if (!actorUserId || !targetUserId) {
    throw new PlatformAdminMutationError("actorUserId and targetUserId are required.");
  }

  const reason = input.reason?.trim() || null;
  const requestId = input.requestId?.trim() || null;

  return client.$transaction(
    async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { id: true, isPlatformAdmin: true },
      });

      if (!actor?.isPlatformAdmin) {
        throw new PlatformAdminMutationError("Only platform admins can manage platform admin roles.");
      }

      const targetBefore = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, isPlatformAdmin: true, email: true, name: true },
      });

      if (!targetBefore) {
        throw new PlatformAdminMutationError("Target user was not found.");
      }

      await tx.$executeRaw`SELECT id FROM "User" WHERE "isPlatformAdmin" = true FOR UPDATE`;

      if (!input.makeAdmin && targetBefore.isPlatformAdmin) {
        const totalAdmins = await tx.user.count({ where: { isPlatformAdmin: true } });
        if (totalAdmins <= 1) {
          throw new LastPlatformAdminError();
        }
      }

      const desired = input.makeAdmin;
      const changed = targetBefore.isPlatformAdmin !== desired;

      if (changed) {
        await tx.user.update({
          where: { id: targetUserId },
          data: { isPlatformAdmin: desired },
        });
      }

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          targetUserId,
          action: desired ? "platform_admin_grant" : "platform_admin_revoke",
          reason,
          requestId,
          before: { isPlatformAdmin: targetBefore.isPlatformAdmin },
          after: { isPlatformAdmin: desired },
        },
      });

      return {
        changed,
        targetUserId,
        isPlatformAdmin: desired,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
