import { describe, expect, it } from "vitest";

import {
  LastPlatformAdminError,
  PlatformAdminMutationError,
  setPlatformAdminStatus,
} from "@/lib/server/admin/platform-admin-mutations";

type UserState = { id: string; isPlatformAdmin: boolean; email: string; name: string };

type FakeClient = {
  users: Map<string, UserState>;
  auditLogs: Array<Record<string, unknown>>;
  $transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T>;
};

function createFakeClient(initialUsers: UserState[]): FakeClient {
  const users = new Map(initialUsers.map((user) => [user.id, { ...user }]));
  const auditLogs: Array<Record<string, unknown>> = [];

  let queue = Promise.resolve();

  const tx = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        if (!user) return null;
        return { ...user };
      },
      count: async ({ where }: { where: { isPlatformAdmin: boolean } }) => {
        if (!where?.isPlatformAdmin) return users.size;
        return Array.from(users.values()).filter((user) => user.isPlatformAdmin).length;
      },
      update: async ({ where, data }: { where: { id: string }; data: { isPlatformAdmin: boolean } }) => {
        const user = users.get(where.id);
        if (!user) throw new Error("missing user");
        user.isPlatformAdmin = data.isPlatformAdmin;
        return { ...user };
      },
    },
    adminAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return data;
      },
    },
    $executeRaw: async () => 0,
  };

  return {
    users,
    auditLogs,
    $transaction: async (fn) => {
      const run = queue.then(() => fn(tx));
      queue = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

describe("setPlatformAdminStatus", () => {
  it("writes audit log and updates admin role on successful grant", async () => {
    const client = createFakeClient([
      { id: "actor", isPlatformAdmin: true, email: "actor@example.com", name: "Actor" },
      { id: "target", isPlatformAdmin: false, email: "target@example.com", name: "Target" },
    ]);

    const result = await setPlatformAdminStatus(
      {
        actorUserId: "actor",
        targetUserId: "target",
        makeAdmin: true,
        reason: "promotion",
      },
      client,
    );

    expect(result).toEqual({ changed: true, targetUserId: "target", isPlatformAdmin: true });
    expect(client.users.get("target")?.isPlatformAdmin).toBe(true);
    expect(client.auditLogs).toHaveLength(1);
  });

  it("rejects revoke when target is last platform admin", async () => {
    const client = createFakeClient([
      { id: "solo", isPlatformAdmin: true, email: "solo@example.com", name: "Solo" },
    ]);

    await expect(
      setPlatformAdminStatus(
        {
          actorUserId: "solo",
          targetUserId: "solo",
          makeAdmin: false,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(LastPlatformAdminError);
  });

  it("blocks non-admin actor", async () => {
    const client = createFakeClient([
      { id: "actor", isPlatformAdmin: false, email: "actor@example.com", name: "Actor" },
      { id: "target", isPlatformAdmin: true, email: "target@example.com", name: "Target" },
    ]);

    await expect(
      setPlatformAdminStatus(
        {
          actorUserId: "actor",
          targetUserId: "target",
          makeAdmin: false,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(PlatformAdminMutationError);
  });

  it("handles concurrent revoke attempts safely so only one succeeds", async () => {
    const client = createFakeClient([
      { id: "a", isPlatformAdmin: true, email: "a@example.com", name: "A" },
      { id: "b", isPlatformAdmin: true, email: "b@example.com", name: "B" },
    ]);

    const [first, second] = await Promise.allSettled([
      setPlatformAdminStatus(
        {
          actorUserId: "a",
          targetUserId: "b",
          makeAdmin: false,
        },
        client,
      ),
      setPlatformAdminStatus(
        {
          actorUserId: "b",
          targetUserId: "a",
          makeAdmin: false,
        },
        client,
      ),
    ]);

    const successes = [first, second].filter((result) => result.status === "fulfilled");
    const failures = [first, second].filter((result) => result.status === "rejected");

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const remainingAdmins = Array.from(client.users.values()).filter((user) => user.isPlatformAdmin);
    expect(remainingAdmins).toHaveLength(1);
  });
});
