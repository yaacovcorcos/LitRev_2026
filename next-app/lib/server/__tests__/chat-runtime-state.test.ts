import { describe, expect, it } from "vitest";
import { InMemoryRuntimeStateAdapter, StateVersionConflictError } from "@/lib/server/chat-runtime/state-adapter";

describe("chat runtime state adapter", () => {
  it("stores and reads versioned state", async () => {
    const adapter = new InMemoryRuntimeStateAdapter<{ count: number }>();
    const saved = await adapter.set("thread:1", { count: 1 });
    const readBack = await adapter.get("thread:1");

    expect(saved.version).toBe(1);
    expect(readBack?.value.count).toBe(1);
  });

  it("increments version on update", async () => {
    const adapter = new InMemoryRuntimeStateAdapter<{ count: number }>();
    await adapter.set("thread:1", { count: 1 });
    const updated = await adapter.update("thread:1", (current) => ({
      count: (current?.value.count ?? 0) + 1,
    }));

    expect(updated.value.count).toBe(2);
    expect(updated.version).toBe(2);
  });

  it("enforces optimistic version checks", async () => {
    const adapter = new InMemoryRuntimeStateAdapter<{ count: number }>();
    await adapter.set("thread:1", { count: 1 });

    await expect(adapter.set("thread:1", { count: 2 }, 0)).rejects.toBeInstanceOf(
      StateVersionConflictError
    );
  });
});

