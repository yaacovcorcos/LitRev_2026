import { describe, it, expect, vi, beforeEach } from 'vitest'

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

// Mock AI config so tests don't depend on env vars
vi.mock('@/lib/ai/config', () => ({
  AI_CONFIG: {
    maxRequestsPerMinute: 20,
    maxTokensPerDay: 100000,
  },
}))

import {
  checkRateLimit,
  checkDailyTokenLimit,
  recordUsage,
  getUsageStats,
  validateRateLimits,
} from '../ai/rate-limiter'
import { prisma } from '@/lib/server/prisma'

const mockCount = prisma.aIUsage.count as ReturnType<typeof vi.fn>
const mockAggregate = prisma.aIUsage.aggregate as ReturnType<typeof vi.fn>
const mockCreate = prisma.aIUsage.create as ReturnType<typeof vi.fn>
const mockFindFirst = prisma.aIUsage.findFirst as ReturnType<typeof vi.fn>

describe('Rate Limiter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
  })

  // -------------------------------------------------------------------------
  // checkDailyTokenLimit
  // -------------------------------------------------------------------------

  describe('checkDailyTokenLimit', () => {
    it('allows request when under daily token limit', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 30000, outputTokens: 20000 },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(true) // 50000 < 100000
    })

    it('blocks request when at daily token limit', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 60000, outputTokens: 40000 },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(false) // 100000 >= 100000
    })

    it('blocks request when over daily token limit', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: 80000, outputTokens: 50000 },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(false) // 130000 > 100000
    })

    it('allows request when no usage exists (null sums)', async () => {
      mockAggregate.mockResolvedValue({
        _sum: { inputTokens: null, outputTokens: null },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(true) // 0 < 100000
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
        _sum: { inputTokens: 50000, outputTokens: null },
      })
      const allowed = await checkDailyTokenLimit('project-1')
      expect(allowed).toBe(true) // 50000 < 100000
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
          model: 'gpt-5.2',
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
          model: 'gpt-5.2-mini',
          inputTokens: 0,
          outputTokens: 0,
        },
      })
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
        _sum: { inputTokens: 80000, outputTokens: 50000 },
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
  })
})
