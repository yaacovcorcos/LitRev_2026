import { describe, expect, it } from "vitest";
import {
  InMemoryConversationLockAdapter,
  withConversationLock,
} from "@/lib/server/chat-runtime/locks";

describe("chat runtime lock adapter", () => {
  it("allows one owner at a time", async () => {
    const adapter = new InMemoryConversationLockAdapter();
    const leaseA = await adapter.acquire("conversation:1", "owner-a", 5_000);
    const leaseB = await adapter.acquire("conversation:1", "owner-b", 5_000);

    expect(leaseA).not.toBeNull();
    expect(leaseB).toBeNull();
  });

  it("releases lock and allows next owner", async () => {
    const adapter = new InMemoryConversationLockAdapter();
    const leaseA = await adapter.acquire("conversation:1", "owner-a", 5_000);
    expect(leaseA).not.toBeNull();

    await leaseA?.release();
    const leaseB = await adapter.acquire("conversation:1", "owner-b", 5_000);
    expect(leaseB).not.toBeNull();
  });

  it("runs critical section with lock guard", async () => {
    const adapter = new InMemoryConversationLockAdapter();
    let ran = false;

    await withConversationLock(
      adapter,
      { key: "conversation:1", owner: "owner-a", ttlMs: 5_000 },
      async () => {
        ran = true;
      }
    );

    expect(ran).toBe(true);
    expect(await adapter.isLocked("conversation:1")).toBe(false);
  });
});

