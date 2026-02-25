import { describe, expect, it } from "vitest";
import { runWithActorContext } from "@/lib/server/actor";
import {
  resolveAuthenticatedIdentity,
  resolveAuthenticatedUserId,
} from "@/lib/server/auth/identity";

describe("auth identity resolver", () => {
  it("prefers explicit user ID when provided", () => {
    expect(resolveAuthenticatedUserId("  user-explicit  ")).toBe("user-explicit");
  });

  it("falls back to actor context when explicit user ID is absent", () => {
    const userId = runWithActorContext(
      { userId: "user-actor", workspaceId: "workspace-actor", role: "owner" },
      () => resolveAuthenticatedUserId(),
    );
    expect(userId).toBe("user-actor");
  });

  it("resolves full identity from actor context", () => {
    const identity = runWithActorContext(
      { userId: "user-actor", workspaceId: "workspace-actor", role: "owner" },
      () => resolveAuthenticatedIdentity(),
    );
    expect(identity).toEqual({
      userId: "user-actor",
      workspaceId: "workspace-actor",
    });
  });

  it("throws when fallback is disabled and no context exists", () => {
    expect(() =>
      resolveAuthenticatedUserId(undefined, { allowTestFallback: false }),
    ).toThrow("Missing authenticated user context for AI service call.");
  });

  it("supports test fallback when context is absent", () => {
    expect(resolveAuthenticatedUserId()).toBe("local-user");
  });
});
