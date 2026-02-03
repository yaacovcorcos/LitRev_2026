import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma before importing the module
vi.mock('@/lib/server/prisma', () => ({
  prisma: {
    project: {
      findFirst: vi.fn(),
    },
  },
}))

import { assertProjectAccess } from '../access'
import { prisma } from '@/lib/server/prisma'

const mockFindFirst = prisma.project.findFirst as ReturnType<typeof vi.fn>

describe('assertProjectAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validScope = {
    ownerId: 'user-123',
    workspaceId: 'workspace-456',
  }

  it('returns scope when access is granted', async () => {
    mockFindFirst.mockResolvedValue({ id: 'project-1' })

    const result = await assertProjectAccess(validScope, 'project-1')

    expect(result).toEqual(validScope)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-1',
        workspaceId: 'workspace-456',
        ownerId: 'user-123',
      },
      select: { id: true },
    })
  })

  it('throws when project not found (wrong projectId)', async () => {
    mockFindFirst.mockResolvedValue(null)

    await expect(
      assertProjectAccess(validScope, 'nonexistent-project')
    ).rejects.toThrow('Project not found or access denied.')
  })

  it('throws when ownerId does not match', async () => {
    // Project exists but query returns null because ownerId filter doesn't match
    mockFindFirst.mockResolvedValue(null)

    const wrongOwnerScope = {
      ownerId: 'wrong-user',
      workspaceId: 'workspace-456',
    }

    await expect(
      assertProjectAccess(wrongOwnerScope, 'project-1')
    ).rejects.toThrow('Project not found or access denied.')
  })

  it('throws when workspaceId does not match', async () => {
    mockFindFirst.mockResolvedValue(null)

    const wrongWorkspaceScope = {
      ownerId: 'user-123',
      workspaceId: 'wrong-workspace',
    }

    await expect(
      assertProjectAccess(wrongWorkspaceScope, 'project-1')
    ).rejects.toThrow('Project not found or access denied.')
  })

  it('throws on empty project ID', async () => {
    await expect(assertProjectAccess(validScope, '')).rejects.toThrow(
      'Project ID is required.'
    )
  })

  it('throws on whitespace-only project ID', async () => {
    await expect(assertProjectAccess(validScope, '   ')).rejects.toThrow(
      'Project ID is required.'
    )
  })

  it('throws when scope is missing ownerId', async () => {
    const incompleteScope = {
      workspaceId: 'workspace-456',
    }

    await expect(
      assertProjectAccess(incompleteScope, 'project-1')
    ).rejects.toThrow('Service scope requires ownerId and workspaceId.')
  })

  it('throws when scope is missing workspaceId', async () => {
    const incompleteScope = {
      ownerId: 'user-123',
    }

    await expect(
      assertProjectAccess(incompleteScope, 'project-1')
    ).rejects.toThrow('Service scope requires ownerId and workspaceId.')
  })

  it('throws when scope is null', async () => {
    await expect(assertProjectAccess(null, 'project-1')).rejects.toThrow(
      'Service scope requires ownerId and workspaceId.'
    )
  })

  it('throws when scope is undefined', async () => {
    await expect(assertProjectAccess(undefined, 'project-1')).rejects.toThrow(
      'Service scope requires ownerId and workspaceId.'
    )
  })

  it('trims whitespace from project ID', async () => {
    mockFindFirst.mockResolvedValue({ id: 'project-1' })

    await assertProjectAccess(validScope, '  project-1  ')

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'project-1',
        }),
      })
    )
  })
})
