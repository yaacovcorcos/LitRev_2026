export type ConversationLockLease = {
  key: string;
  owner: string;
  expiresAt: number;
  renew: (ttlMs: number) => Promise<boolean>;
  release: () => Promise<void>;
};

export interface ConversationLockAdapter {
  acquire(key: string, owner: string, ttlMs: number): Promise<ConversationLockLease | null>;
  release(key: string, owner: string): Promise<void>;
  isLocked(key: string): Promise<boolean>;
}

type LockRecord = {
  owner: string;
  expiresAt: number;
};

export class InMemoryConversationLockAdapter implements ConversationLockAdapter {
  private locks = new Map<string, LockRecord>();

  private now(): number {
    return Date.now();
  }

  private getLiveLock(key: string): LockRecord | null {
    const current = this.locks.get(key);
    if (!current) return null;
    if (current.expiresAt <= this.now()) {
      this.locks.delete(key);
      return null;
    }
    return current;
  }

  async acquire(key: string, owner: string, ttlMs: number): Promise<ConversationLockLease | null> {
    const existing = this.getLiveLock(key);
    if (existing && existing.owner !== owner) return null;

    const next: LockRecord = {
      owner,
      expiresAt: this.now() + ttlMs,
    };
    this.locks.set(key, next);

    return {
      key,
      owner,
      expiresAt: next.expiresAt,
      renew: async (nextTtlMs: number) => {
        const live = this.getLiveLock(key);
        if (!live || live.owner !== owner) return false;
        const renewed: LockRecord = { owner, expiresAt: this.now() + nextTtlMs };
        this.locks.set(key, renewed);
        return true;
      },
      release: async () => {
        await this.release(key, owner);
      },
    };
  }

  async release(key: string, owner: string): Promise<void> {
    const existing = this.getLiveLock(key);
    if (!existing) return;
    if (existing.owner === owner) {
      this.locks.delete(key);
    }
  }

  async isLocked(key: string): Promise<boolean> {
    return this.getLiveLock(key) !== null;
  }
}

export async function withConversationLock<T>(
  adapter: ConversationLockAdapter,
  params: {
    key: string;
    owner: string;
    ttlMs: number;
    onLockedError?: () => Error;
  },
  fn: () => Promise<T>
): Promise<T> {
  const lease = await adapter.acquire(params.key, params.owner, params.ttlMs);
  if (!lease) {
    throw params.onLockedError?.() ?? new Error(`Conversation is already locked: ${params.key}`);
  }
  try {
    return await fn();
  } finally {
    await lease.release();
  }
}

