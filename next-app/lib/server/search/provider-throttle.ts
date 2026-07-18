import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/lib/server/prisma";
import { logServerWarn } from "@/lib/server/logging";
import { parseRetryAfterHeaderMs, sleep } from "@/lib/server/utils/retry";

export type SearchProvider = "openalex" | "pubmed" | "semantic-scholar";

type ProviderThrottleConfig = {
  minIntervalMs: number;
  maxQueueWaitMs: number;
  credential?: string;
};

export type SearchProviderThrottleStore = {
  reserve(providerKey: string, minIntervalMs: number, maxQueueWaitMs: number): Promise<Date>;
  defer(providerKey: string, delayMs: number): Promise<void>;
};

export type SearchProviderThrottleRuntime = {
  now?: () => number;
  sleep?: typeof sleep;
};

const PROVIDER_LABELS: Record<SearchProvider, string> = {
  openalex: "OpenAlex",
  pubmed: "PubMed",
  "semantic-scholar": "Semantic Scholar",
};

function providerConfig(provider: SearchProvider): ProviderThrottleConfig {
  switch (provider) {
    case "pubmed":
      return {
        minIntervalMs: process.env.NCBI_API_KEY ? 100 : 340,
        maxQueueWaitMs: 10_000,
        credential: process.env.NCBI_API_KEY,
      };
    case "semantic-scholar":
      return {
        minIntervalMs: process.env.SEMANTIC_SCHOLAR_API_KEY ? 1_050 : 3_400,
        maxQueueWaitMs: 10_000,
        credential: process.env.SEMANTIC_SCHOLAR_API_KEY,
      };
    case "openalex":
      return {
        minIntervalMs: 120,
        maxQueueWaitMs: 10_000,
        credential: process.env.OPENALEX_EMAIL,
      };
  }
}

export function buildSearchProviderThrottleKey(
  provider: SearchProvider,
  credential?: string,
): string {
  const normalizedCredential = credential?.trim();
  if (!normalizedCredential) return `${provider}:anonymous`;
  const digest = createHash("sha256").update(normalizedCredential).digest("hex").slice(0, 24);
  return `${provider}:credential:${digest}`;
}

export const prismaSearchProviderThrottleStore: SearchProviderThrottleStore = {
  async reserve(providerKey, minIntervalMs, maxQueueWaitMs) {
    const rows = await prisma.$queryRaw<Array<{ reservedAt: Date }>>`
      INSERT INTO "SearchProviderThrottle" ("providerKey", "nextAvailableAt", "updatedAt")
      VALUES (
        ${providerKey},
        timezone('UTC', clock_timestamp()) + (${minIntervalMs} * interval '1 millisecond'),
        timezone('UTC', clock_timestamp())
      )
      ON CONFLICT ("providerKey") DO UPDATE SET
        "nextAvailableAt" = GREATEST(
          "SearchProviderThrottle"."nextAvailableAt",
          timezone('UTC', clock_timestamp())
        ) + (${minIntervalMs} * interval '1 millisecond'),
        "updatedAt" = timezone('UTC', clock_timestamp())
      WHERE "SearchProviderThrottle"."nextAvailableAt"
        <= timezone('UTC', clock_timestamp()) + (${maxQueueWaitMs} * interval '1 millisecond')
      RETURNING "nextAvailableAt" - (${minIntervalMs} * interval '1 millisecond') AS "reservedAt"
    `;
    const reservedAt = rows[0]?.reservedAt;
    if (!(reservedAt instanceof Date) || !Number.isFinite(reservedAt.getTime())) {
      throw new SearchProviderThrottleBusyError(providerKey, minIntervalMs);
    }
    return reservedAt;
  },

  async defer(providerKey, delayMs) {
    await prisma.$executeRaw`
      INSERT INTO "SearchProviderThrottle" ("providerKey", "nextAvailableAt", "updatedAt")
      VALUES (
        ${providerKey},
        timezone('UTC', clock_timestamp()) + (${delayMs} * interval '1 millisecond'),
        timezone('UTC', clock_timestamp())
      )
      ON CONFLICT ("providerKey") DO UPDATE SET
        "nextAvailableAt" = GREATEST(
          "SearchProviderThrottle"."nextAvailableAt",
          timezone('UTC', clock_timestamp()) + (${delayMs} * interval '1 millisecond')
        ),
        "updatedAt" = timezone('UTC', clock_timestamp())
    `;
  },
};

export class SearchProviderThrottle {
  constructor(
    private readonly store: SearchProviderThrottleStore = prismaSearchProviderThrottleStore,
    private readonly runtime: SearchProviderThrottleRuntime = {},
  ) {}

  async wait(provider: SearchProvider, signal?: AbortSignal): Promise<void> {
    const config = providerConfig(provider);
    const providerKey = buildSearchProviderThrottleKey(provider, config.credential);
    const reservedAt = await this.store.reserve(
      providerKey,
      config.minIntervalMs,
      config.maxQueueWaitMs,
    );
    const delayMs = Math.max(0, reservedAt.getTime() - (this.runtime.now ?? Date.now)());
    if (delayMs > 0) {
      await (this.runtime.sleep ?? sleep)(delayMs, signal);
    }
  }

  async deferFromResponse(provider: SearchProvider, response: Response): Promise<void> {
    const retryAfterMs = parseRetryAfterHeaderMs(Object.fromEntries(response.headers.entries()));
    if (retryAfterMs === undefined || retryAfterMs <= 0) return;
    const config = providerConfig(provider);
    const providerKey = buildSearchProviderThrottleKey(provider, config.credential);
    try {
      await this.store.defer(providerKey, retryAfterMs);
    } catch (error) {
      logServerWarn("search-provider-throttle", "failed to persist provider cooldown", {
        provider,
        retryAfterMs,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }
}

export class SearchProviderThrottleBusyError extends Error {
  readonly status = 429;
  readonly statusCode = 429;
  readonly code = "SEARCH_PROVIDER_THROTTLE_BUSY";
  readonly headers: Record<string, string>;

  constructor(providerKey: string, retryAfterMs: number) {
    super(`Search provider throttle is busy for ${providerKey}.`);
    this.name = "SearchProviderThrottleBusyError";
    this.headers = { "retry-after-ms": String(retryAfterMs) };
  }
}

export class SearchProviderHttpError extends Error {
  readonly status: number;
  readonly statusCode: number;
  readonly headers: Record<string, string>;
  readonly code: string;

  constructor(provider: SearchProvider, response: Response) {
    const label = PROVIDER_LABELS[provider];
    super(`${label} request failed with status ${response.status}.`);
    this.name = "SearchProviderHttpError";
    this.status = response.status;
    this.statusCode = response.status;
    this.headers = Object.fromEntries(response.headers.entries());
    this.code = `SEARCH_PROVIDER_HTTP_${response.status}`;
  }
}

const sharedThrottle = new SearchProviderThrottle();

export async function fetchSearchProvider(
  provider: SearchProvider,
  input: string | URL,
  init?: RequestInit,
  options?: { throttle?: SearchProviderThrottle },
): Promise<Response> {
  const throttle = options?.throttle ?? sharedThrottle;
  await throttle.wait(provider, init?.signal ?? undefined);
  const response = await fetch(input, init);
  if (response.ok) return response;
  await throttle.deferFromResponse(provider, response);
  throw new SearchProviderHttpError(provider, response);
}
