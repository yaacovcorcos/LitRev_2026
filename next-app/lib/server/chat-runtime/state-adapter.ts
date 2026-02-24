export type VersionedState<T> = {
  value: T;
  version: number;
  updatedAt: string;
};

export class StateVersionConflictError extends Error {
  constructor(message = "State version conflict") {
    super(message);
    this.name = "StateVersionConflictError";
  }
}

export interface RuntimeStateAdapter<T> {
  get(key: string): Promise<VersionedState<T> | null>;
  set(key: string, value: T, expectedVersion?: number): Promise<VersionedState<T>>;
  update(
    key: string,
    updater: (current: VersionedState<T> | null) => T,
    expectedVersion?: number
  ): Promise<VersionedState<T>>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<Array<{ key: string; state: VersionedState<T> }>>;
}

export class InMemoryRuntimeStateAdapter<T> implements RuntimeStateAdapter<T> {
  private store = new Map<string, VersionedState<T>>();

  async get(key: string): Promise<VersionedState<T> | null> {
    const current = this.store.get(key);
    return current ? { ...current } : null;
  }

  async set(key: string, value: T, expectedVersion?: number): Promise<VersionedState<T>> {
    const current = this.store.get(key);
    if (expectedVersion !== undefined) {
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw new StateVersionConflictError(
          `Expected version ${expectedVersion}, got ${currentVersion}`
        );
      }
    }

    const next: VersionedState<T> = {
      value,
      version: (current?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    this.store.set(key, next);
    return { ...next };
  }

  async update(
    key: string,
    updater: (current: VersionedState<T> | null) => T,
    expectedVersion?: number
  ): Promise<VersionedState<T>> {
    const current = this.store.get(key) ?? null;
    if (expectedVersion !== undefined) {
      const currentVersion = current?.version ?? 0;
      if (currentVersion !== expectedVersion) {
        throw new StateVersionConflictError(
          `Expected version ${expectedVersion}, got ${currentVersion}`
        );
      }
    }
    const nextValue = updater(current ? { ...current } : null);
    return this.set(key, nextValue, current?.version ?? 0);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix?: string): Promise<Array<{ key: string; state: VersionedState<T> }>> {
    const entries: Array<{ key: string; state: VersionedState<T> }> = [];
    for (const [key, state] of this.store.entries()) {
      if (!prefix || key.startsWith(prefix)) {
        entries.push({ key, state: { ...state } });
      }
    }
    entries.sort((a, b) => a.key.localeCompare(b.key));
    return entries;
  }
}

