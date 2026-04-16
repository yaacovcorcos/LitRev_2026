import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import {
  bootstrapPlatformAdmin,
  recoverPlatformAdmin,
} from "@/lib/server/admin/platform-admin-bootstrap";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const userFindMany = vi.mocked(prisma.user.findMany);
const userCount = vi.mocked(prisma.user.count);
const userUpdate = vi.mocked(prisma.user.update);

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "u1",
    email: "admin@example.com",
    isPlatformAdmin: false,
    name: "Yaacov",
    emailVerified: false,
    image: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("platform admin bootstrap", () => {
  beforeEach(() => {
    userFindMany.mockReset();
    userCount.mockReset();
    userUpdate.mockReset();
    delete process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAIL;
  });

  it("bootstraps the first platform admin", async () => {
    userFindMany.mockResolvedValue([createMockUser()]);
    userCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    userUpdate.mockResolvedValue(createMockUser({ isPlatformAdmin: true }));

    const result = await bootstrapPlatformAdmin("admin@example.com");
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { isPlatformAdmin: true },
    });
    expect(result).toMatchObject({
      mode: "bootstrap",
      email: "admin@example.com",
      userId: "u1",
      alreadyAdmin: false,
      totalAdminsAfter: 1,
    });
  });

  it("blocks bootstrap when an admin already exists and target is not admin", async () => {
    userFindMany.mockResolvedValue([createMockUser()]);
    userCount.mockResolvedValueOnce(2);

    await expect(bootstrapPlatformAdmin("admin@example.com")).rejects.toThrow(
      "Bootstrap blocked",
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("allows recovery to grant admin when admins already exist", async () => {
    userFindMany.mockResolvedValue([createMockUser()]);
    userCount.mockResolvedValueOnce(3);
    userUpdate.mockResolvedValue(createMockUser({ isPlatformAdmin: true }));

    const result = await recoverPlatformAdmin("admin@example.com");
    expect(userUpdate).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe("recover");
    expect(result.totalAdminsAfter).toBe(3);
  });

  it("supports env var email fallback", async () => {
    process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAIL = "admin@example.com";
    userFindMany.mockResolvedValue([createMockUser({ isPlatformAdmin: true })]);
    userCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    const result = await bootstrapPlatformAdmin();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(result.alreadyAdmin).toBe(true);
  });
});
