import { describe, it, expect, vi, beforeEach } from 'vitest'

const configMocks = vi.hoisted(() => ({
  getModelCapabilityRecord: vi.fn(),
}))

// Mock Prisma before importing the module
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    aIUsage: {
      count: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

const UNDER_LIMIT_USAGE = { inputTokens: 120000, outputTokens: 60000 }
const AT_LIMIT_USAGE = { inputTokens: 180000, outputTokens: 120000 }
const OVER_LIMIT_USAGE = { inputTokens: 220000, outputTokens: 120000 }
const EMPTY_ROUTING_USAGE_FIELDS = {
  provider: null,
  requestedModel: null,
  requestedProvider: null,
  requestedReasoningEffort: null,
  requestedDeliveryMode: null,
  actualReasoningEffort: null,
  actualDeliveryMode: null,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  reasoningTokens: 0,
  estimatedCostUsd: undefined,
}

// Mock AI config so tests don't depend on env vars
vi.mock('@/lib/ai/config', () => ({
  AI_CONFIG: {
    maxRequestsPerMinute: 20,
    maxTokensPerDay: 300000,
    maxTranscriptionsPerDay: 100,
  },
  getModelCapabilityRecord: configMocks.getModelCapabilityRecord,
}))

import {
  checkRateLimit,
  checkDailyTokenLimit,
  countUsageRequestsSince,
  getCacheMetricSummary,
  recordUsage,
  recordCacheMetric,
  resetCacheMetricsForTests,
  getUsageStats,
  validateRateLimits,
  estimateUsageCostUsd,
} from '../ai/rate-limiter'
import { prisma } from '@/lib/server/prisma'

const mockCount = prisma.aIUsage.count as ReturnType<typeof vi.fn>
const mockAggregate = prisma.aIUsage.aggregate as ReturnType<typeof vi.fn>
const mockCreate = prisma.aIUsage.create as ReturnType<typeof vi.fn>
const mockFindFirst = prisma.aIUsage.findFirst as ReturnType<typeof vi.fn>

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    configMocks.getModelCapabilityRecord.mockReturnValue(undefined)
    resetCacheMetricsForTests()
  })

  // -------------------------------------------------------------------------
  // checkRateLimit
  // -------------------------------------------------------------------------

  describe('checkRateLimit', () => {
    it('allows request when under the per-minute limit', async () => {
      mockCount.mockResolvedValue(5)
      const allowed = await checkRateLimit('project-1')
      expect(allowed).toBe(true)
    })

    it('blocks request when at the per-minute limit', async () => {
      mockCount.mockResolvedValue(20) // exactly at limit
      const allowed = await checkRateLimit('project-1')
      expect(allowed).toBe(false)
    })

    it('blocks request when over the per-minute limit', async () => {
      mockCount.mockResolvedValue(25)
      const allowed = await checkRateLimit('project-1')
      expect(allowed).toBe(false)
    })

    it('allows request when count is 0', async () => {
      mockCount.mockResolvedValue(0)
      const allowed = await checkRateLimit('project-1')
      expect(allowed).toBe(true)
    })

    it('allows request at limit minus one (19 of 20)', async () => {
      mockCount.mockResolvedValue(19)
      const allowed = await checkRateLimit('project-1')
      expect(allowed).toBe(true)
    })

    it('queries with correct projectId and time window', async () => {
      mockCount.mockResolvedValue(0)
      const before = Date.now()
      await checkRateLimit('project-xyz')
      const after = Date.now()

      expect(mockCount).toHaveBeenCalledTimes(1)
      const callArgs = mockCount.mock.calls[0][0]
      expect(callArgs.where.projectId).toBe('project-xyz')

      // The gte timestamp should be roughly 60 seconds ago
      const gteTime = callArgs.where.createdAt.gte.getTime()
      expect(gteTime).toBeGreaterThanOrEqual(before - 60_000 - 50)
      expect(gteTime).toBeLessThanOrEqual(after - 60_000 + 50)
    })

    it('supports null projectId for global scope', async () => {
      mockCount.mockResolvedValue(0)
      const allowed = await checkRateLimit(null)
      expect(allowed).toBe(true)
      expect(mockCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: null }),
        }),
      )
    })

    it('uses user/workspace scope when userId is provided', async () => {
      mockCount.mockResolvedValue(0)
      await checkRateLimit({ projectId: 'project-xyz', userId: 'user-1', workspaceId: 'workspace-1' })

      const callArgs = mockCount.mock.calls[0][0]
      expect(callArgs.where).toMatchObject({
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
      expect(callArgs.where.projectId).toBeUndefined()
    })
  })

  describe('countUsageRequestsSince', () => {
    it('counts usage rows with an optional source filter', async () => {
      mockCount.mockResolvedValue(3)
      const since = new Date('2026-04-05T00:00:00.000Z')

      const count = await countUsageRequestsSince(
        { userId: 'user-1', workspaceId: 'workspace-1' },
        since,
        { source: 'voice_transcription' },
      )

      expect(count).toBe(3)
      expect(mockCount).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          workspaceId: 'workspace-1',
          createdAt: { gte: since },
          source: 'voice_transcription',
        },
      })
    })
  })

  // -------------------------------------------------------------------------
  // checkDailyTokenLimit
  // -------------------------------------------------------------------------

  describe('checkDailyTokenLimit', () => {
    it('allows request when under daily token limit', async () => {
      mockAggregate.mockResolvedValue({
        _sum: UNDER_LIMIT_USAGE,
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(true) // 180000 < MAX_TOKENS_PER_DAY
    })

    it('blocks request when at daily token limit', async () => {
      mockAggregate.mockResolvedValue({
        _sum: AT_LIMIT_USAGE,
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(false) // 300000 >= MAX_TOKENS_PER_DAY
    })

    it('blocks request when over daily token limit', async () => {
      mockAggregate.mockResolvedValue({
        _sum: OVER_LIMIT_USAGE,
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(false) // 340000 > MAX_TOKENS_PER_DAY
    })

    it('allows request when no usage exists (null sums)', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: null, outputTokens: null },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(true) // 0 < MAX_TOKENS_PER_DAY
    })

    it('queries from start of today', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0 },
      })
      await checkDailyTokenLimit('project-1')

      const callArgs = mockAggregate.mock.calls[0][0]
      const startOfDay = callArgs.where.createdAt.gte as Date

      expect(startOfDay.getHours()).toBe(0)
      expect(startOfDay.getMinutes()).toBe(0)
      expect(startOfDay.getSeconds()).toBe(0)
      expect(startOfDay.getMilliseconds()).toBe(0)
    })

    it('handles partial null sums (only input or only output)', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 120000, outputTokens: null },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(true) // 120000 < MAX_TOKENS_PER_DAY
    })

    it('supports null projectId for global scope', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0 },
      })
      const allowed = await checkDailyTokenLimit(null)
      expect(allowed).toBe(true)
      expect(mockAggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: null }),
        }),
      )
    })

    it('aggregates by user/workspace scope when userId is provided', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 1200, outputTokens: 800 },
      })

      const allowed = await checkDailyTokenLimit({ userId: 'user-2', workspaceId: 'workspace-2' })
      expect(allowed).toBe(true)

      const callArgs = mockAggregate.mock.calls[0][0]
      expect(callArgs.where).toMatchObject({
        userId: 'user-2',
        workspaceId: 'workspace-2',
      })
      expect(callArgs.where.projectId).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // recordUsage
  // -------------------------------------------------------------------------

  describe('recordUsage', () => {
    it('creates a usage record with correct data', async () => {
      mockCreate.mockResolvedValue({})
      await recordUsage('project-1', 'gpt-5.2', 500, 200)

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          projectId: 'project-1',
          userId: null,
          workspaceId: null,
          source: 'project_copilot',
          contextPage: 'legacy_unknown',
          conversationId: null,
          model: 'gpt-5.2',
          ...EMPTY_ROUTING_USAGE_FIELDS,
          inputTokens: 500,
          outputTokens: 200,
        },
      })
    })

    it('records zero tokens correctly', async () => {
      mockCreate.mockResolvedValue({})
      await recordUsage('project-1', 'gpt-5.2-mini', 0, 0)

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          projectId: 'project-1',
          userId: null,
          workspaceId: null,
          source: 'project_copilot',
          contextPage: 'legacy_unknown',
          conversationId: null,
          model: 'gpt-5.2-mini',
          ...EMPTY_ROUTING_USAGE_FIELDS,
          inputTokens: 0,
          outputTokens: 0,
        },
      })
    })

    it('records voice transcription with an explicit source and context page', async () => {
      mockCreate.mockResolvedValue({})
      await recordUsage(null, 'whisper-large-v3-turbo', 0, 0, {
        userId: 'user-1',
        workspaceId: 'workspace-1',
        source: 'voice_transcription',
        contextPage: 'overview',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          projectId: null,
          userId: 'user-1',
          workspaceId: 'workspace-1',
          source: 'voice_transcription',
          contextPage: 'overview',
          conversationId: null,
          model: 'whisper-large-v3-turbo',
          ...EMPTY_ROUTING_USAGE_FIELDS,
          inputTokens: 0,
          outputTokens: 0,
        },
      })
    })

    it('tracks cache efficiency when cached tokens are provided', async () => {
      mockCreate.mockResolvedValue({})

      await recordUsage('project-1', 'gpt-5.2', 1000, 300, { cachedInputTokens: 250 })
      const summary = getCacheMetricSummary('project-1')

      expect(summary).toMatchObject({
        requestCount: 1,
        cacheHitRequests: 1,
        totalInputTokens: 1000,
        totalCachedInputTokens: 250,
      })
      expect(summary?.cacheHitRate).toBe(1)
      expect(summary?.cachedTokenRate).toBe(0.25)
    })

    it('persists cache-write tokens separately from cache-hit tokens', async () => {
      mockCreate.mockResolvedValue({})

      await recordUsage('project-1', 'gpt-5.6-luna', 1000, 300, {
        cachedInputTokens: 200,
        cacheWriteInputTokens: 300,
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          inputTokens: 1000,
          cachedInputTokens: 200,
          cacheWriteInputTokens: 300,
          outputTokens: 300,
        }),
      })
    })

    it('records null projectId and skips project cache summary', async () => {
      mockCreate.mockResolvedValue({})

      await recordUsage(null, 'gpt-5.2', 100, 20, { cachedInputTokens: 50 })

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          projectId: null,
          userId: null,
          workspaceId: null,
          source: 'ai_page',
          contextPage: 'legacy_unknown',
          conversationId: null,
          model: 'gpt-5.2',
          ...EMPTY_ROUTING_USAGE_FIELDS,
          cachedInputTokens: 50,
          inputTokens: 100,
          outputTokens: 20,
        },
      })
      expect(getCacheMetricSummary('global')).toBeNull()
    })

    it('records user/workspace scoped usage when identity is provided', async () => {
      mockCreate.mockResolvedValue({})
      await recordUsage('project-2', 'gpt-5.2', 250, 125, {
        userId: 'user-3',
        workspaceId: 'workspace-3',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          projectId: 'project-2',
          userId: 'user-3',
          workspaceId: 'workspace-3',
          source: 'project_copilot',
          contextPage: 'legacy_unknown',
          conversationId: null,
          model: 'gpt-5.2',
          ...EMPTY_ROUTING_USAGE_FIELDS,
          inputTokens: 250,
          outputTokens: 125,
        },
      })
    })

    it('records explicit attribution fields when provided', async () => {
      mockCreate.mockResolvedValue({})
      await recordUsage('project-2', 'gpt-5.2', 250, 125, {
        userId: 'user-3',
        workspaceId: 'workspace-3',
        source: 'project_copilot',
        contextPage: 'ledger',
        conversationId: 'conv-1',
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'project_copilot',
          contextPage: 'ledger',
          conversationId: 'conv-1',
        }),
      })
    })
  })

  describe('cost estimation', () => {
    function usePricingModel(params: {
      providerDialect: 'openai' | 'qwen' | 'xai'
      inputPerMillion: number
      cachedInputPerMillion: number
      cacheWriteInputPerMillion?: number
      outputPerMillion: number
    }) {
      configMocks.getModelCapabilityRecord.mockReturnValue({
        providerDialect: params.providerDialect,
        pricing: {
          currency: 'USD',
          asOf: '2026-07-12',
          inputPerMillion: params.inputPerMillion,
          cachedInputPerMillion: params.cachedInputPerMillion,
          cacheWriteInputPerMillion: params.cacheWriteInputPerMillion,
          outputPerMillion: params.outputPerMillion,
          standardizedLargeTaskUsd: 0,
        },
      })
    }

    it('uses separate uncached, cached, and output prices at the base tier', () => {
      usePricingModel({
        providerDialect: 'openai',
        inputPerMillion: 1,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'gpt-5.6-luna',
        inputTokens: 1_000,
        cachedInputTokens: 200,
        outputTokens: 100,
      })).toBeCloseTo(0.00142, 8)
    })

    it('applies the OpenAI long-context input and output multipliers', () => {
      usePricingModel({
        providerDialect: 'openai',
        inputPerMillion: 1,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'gpt-5.6-luna',
        inputTokens: 300_000,
        cachedInputTokens: 100_000,
        outputTokens: 20_000,
      })).toBeCloseTo(0.6, 8)
    })

    it('prices OpenAI cache writes as a disjoint 1.25x input category', () => {
      usePricingModel({
        providerDialect: 'openai',
        inputPerMillion: 1,
        cachedInputPerMillion: 0.1,
        cacheWriteInputPerMillion: 1.25,
        outputPerMillion: 6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'gpt-5.6-luna',
        inputTokens: 1_000,
        cachedInputTokens: 200,
        cacheWriteInputTokens: 300,
        outputTokens: 100,
      })).toBeCloseTo(0.001495, 8)
    })

    it('returns no estimate when provider cache categories overlap or the write rate is unknown', () => {
      usePricingModel({
        providerDialect: 'openai',
        inputPerMillion: 1,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'gpt-5.6-luna',
        inputTokens: 1_000,
        cachedInputTokens: 700,
        cacheWriteInputTokens: 400,
        outputTokens: 100,
      })).toBeUndefined()
      expect(estimateUsageCostUsd({
        modelId: 'gpt-5.6-luna',
        inputTokens: 1_000,
        cacheWriteInputTokens: 200,
        outputTokens: 100,
      })).toBeUndefined()
    })

    it('applies Qwen long-context pricing above 256K input tokens', () => {
      usePricingModel({
        providerDialect: 'qwen',
        inputPerMillion: 0.4,
        cachedInputPerMillion: 0.08,
        cacheWriteInputPerMillion: 0.5,
        outputPerMillion: 1.6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'qwen3.7-plus',
        inputTokens: 300_000,
        outputTokens: 10_000,
      })).toBeCloseTo(0.408, 8)
    })

    it('prices reported Qwen cache writes at both base and long-context tiers', () => {
      usePricingModel({
        providerDialect: 'qwen',
        inputPerMillion: 0.4,
        cachedInputPerMillion: 0.08,
        cacheWriteInputPerMillion: 0.5,
        outputPerMillion: 1.6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'qwen3.7-plus',
        inputTokens: 100_000,
        cachedInputTokens: 20_000,
        cacheWriteInputTokens: 30_000,
        outputTokens: 10_000,
      })).toBeCloseTo(0.0526, 8)
      expect(estimateUsageCostUsd({
        modelId: 'qwen3.7-plus',
        inputTokens: 300_000,
        cachedInputTokens: 50_000,
        cacheWriteInputTokens: 50_000,
        outputTokens: 10_000,
      })).toBeCloseTo(0.375, 8)
    })

    it('keeps Grok flat through 500K context and applies only the confirmed priority multiplier', () => {
      usePricingModel({
        providerDialect: 'xai',
        inputPerMillion: 2,
        cachedInputPerMillion: 0.5,
        outputPerMillion: 6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'grok-4.5',
        inputTokens: 300_000,
        outputTokens: 10_000,
        confirmedDeliveryMode: 'priority',
      })).toBeCloseTo(1.32, 8)
    })

    it('does not persist a knowingly false base estimate for OpenAI priority', () => {
      usePricingModel({
        providerDialect: 'openai',
        inputPerMillion: 1,
        cachedInputPerMillion: 0.1,
        outputPerMillion: 6,
      })

      expect(estimateUsageCostUsd({
        modelId: 'gpt-5.6-luna',
        inputTokens: 1_000,
        outputTokens: 100,
        confirmedDeliveryMode: 'priority',
      })).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // cache metrics
  // -------------------------------------------------------------------------

  describe('cache metrics', () => {
    it('accumulates cache hit and token ratios', () => {
      const first = recordCacheMetric('project-1', 'gpt-5.2', 1000, 100)
      const second = recordCacheMetric('project-1', 'gpt-5.2', 500, 0)

      expect(first.requestCount).toBe(1)
      expect(second.requestCount).toBe(2)
      expect(second.cacheHitRequests).toBe(1)
      expect(second.totalInputTokens).toBe(1500)
      expect(second.totalCachedInputTokens).toBe(100)
      expect(second.cacheHitRate).toBe(0.5)
      expect(second.cachedTokenRate).toBeCloseTo(100 / 1500, 6)
    })

    it('clamps cached tokens to input token count', () => {
      const summary = recordCacheMetric('project-1', 'gpt-5.2', 200, 1000)
      expect(summary.totalCachedInputTokens).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // getUsageStats
  // -------------------------------------------------------------------------

  describe('getUsageStats', () => {
    it('returns aggregated stats correctly', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 10000, outputTokens: 5000 },
        _count: 12,
      })
      mockFindFirst.mockResolvedValue({
        createdAt: new Date('2025-06-15T12:00:00Z'),
      })

      const stats = await getUsageStats('project-1')

      expect(stats).toEqual({
        totalTokens: 15000,
        requestCount: 12,
        lastRequestAt: '2025-06-15T12:00:00.000Z',
      })
    })

    it('handles no usage history', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: null, outputTokens: null },
        _count: 0,
      })
      mockFindFirst.mockResolvedValue(null)

      const stats = await getUsageStats('project-1')

      expect(stats).toEqual({
        totalTokens: 0,
        requestCount: 0,
        lastRequestAt: null,
      })
    })

    it('queries for today only', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0 },
        _count: 0,
      })
      mockFindFirst.mockResolvedValue(null)

      await getUsageStats('project-1')

      const aggregateArgs = mockAggregate.mock.calls[0][0]
      const startOfDay = aggregateArgs.where.createdAt.gte as Date
      expect(startOfDay.getHours()).toBe(0)
      expect(startOfDay.getMinutes()).toBe(0)
    })
  })

  // -------------------------------------------------------------------------
  // validateRateLimits
  // -------------------------------------------------------------------------

  describe('validateRateLimits', () => {
    it('does not throw when both limits are fine', async () => {
      mockCount.mockResolvedValue(5)
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 1000, outputTokens: 500 },
      })

      await expect(validateRateLimits('project-1')).resolves.toBeUndefined()
    })

    it('throws rate limit error when per-minute limit exceeded', async () => {
      mockCount.mockResolvedValue(25)
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 1000, outputTokens: 500 },
      })

      await expect(validateRateLimits('project-1')).rejects.toThrow(
        'Rate limit exceeded'
      )
    })

    it('throws token limit error when daily limit exceeded', async () => {
      mockCount.mockResolvedValue(5)
      mockAggregate.mockResolvedValue({
        _sum: OVER_LIMIT_USAGE,
      })

      await expect(validateRateLimits('project-1')).rejects.toThrow(
        'Daily token limit exceeded'
      )
    })

    it('throws rate limit error first when both limits exceeded', async () => {
      mockCount.mockResolvedValue(25)
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 80000, outputTokens: 50000 },
      })

      // The function checks rate first, then tokens. It should throw for rate.
      await expect(validateRateLimits('project-1')).rejects.toThrow(
        'Rate limit exceeded'
      )
    })

    it('includes limit numbers in error messages', async () => {
      mockCount.mockResolvedValue(25)
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 0, outputTokens: 0 },
      })

      await expect(validateRateLimits('project-1')).rejects.toThrow(
        'Maximum 20 requests per minute'
      )
    })

    it('accepts null projectId for global scope', async () => {
      mockCount.mockResolvedValue(5)
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 1000, outputTokens: 500 },
      })

      await expect(validateRateLimits(null)).resolves.toBeUndefined()
    })
  })
})
