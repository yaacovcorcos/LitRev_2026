/**
 * Database Smoke Test
 *
 * This test verifies:
 * - Database connection works
 * - Single-user seed can be created/exists
 * - Basic Prisma operations succeed
 *
 * OPT-IN: Only runs when RUN_DB_TESTS=1 is set.
 * Run with: RUN_DB_TESTS=1 npm test -- db-smoke
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest'

const shouldRunDbTests = process.env.RUN_DB_TESTS === '1'

// Conditionally import to avoid connection errors when not running DB tests
let prisma: typeof import('@/lib/server/prisma').prisma
let ensureSingleUserSeed: typeof import('@/lib/server/bootstrap').ensureSingleUserSeed
let SINGLE_USER_SCOPE: typeof import('@/lib/server/scope').SINGLE_USER_SCOPE

describe.skipIf(!shouldRunDbTests)('Database Smoke Test', () => {
  beforeAll(async () => {
    // Dynamic imports to prevent connection attempts when tests are skipped
    const prismaModule = await import('@/lib/server/prisma')
    const bootstrapModule = await import('@/lib/server/bootstrap')
    const scopeModule = await import('@/lib/server/scope')

    prisma = prismaModule.prisma
    ensureSingleUserSeed = bootstrapModule.ensureSingleUserSeed
    SINGLE_USER_SCOPE = scopeModule.SINGLE_USER_SCOPE
  })

  afterAll(async () => {
    // Disconnect Prisma to prevent hanging test runner
    if (prisma) {
      await prisma.$disconnect()
    }
  })

  it('connects to the database', async () => {
    // Simple query to verify connection
    const result = await prisma.$queryRaw`SELECT 1 as connected`
    expect(result).toBeDefined()
  })

  it('creates single-user seed successfully', async () => {
    const scope = await ensureSingleUserSeed(SINGLE_USER_SCOPE)

    expect(scope).toEqual({
      ownerId: 'local-user',
      workspaceId: 'local-workspace',
    })
  })

  it('single-user seed is idempotent (can be called multiple times)', async () => {
    // Call twice - should not throw
    const scope1 = await ensureSingleUserSeed(SINGLE_USER_SCOPE)
    const scope2 = await ensureSingleUserSeed(SINGLE_USER_SCOPE)

    expect(scope1).toEqual(scope2)
  })

  it('user record exists after seeding', async () => {
    const user = await prisma.user.findUnique({
      where: { id: 'local-user' },
    })

    expect(user).not.toBeNull()
    expect(user?.id).toBe('local-user')
    expect(user?.name).toBe('Local User')
  })

  it('workspace record exists after seeding', async () => {
    const workspace = await prisma.workspace.findUnique({
      where: { id: 'local-workspace' },
    })

    expect(workspace).not.toBeNull()
    expect(workspace?.id).toBe('local-workspace')
    expect(workspace?.name).toBe('Local Workspace')
  })

  it('workspace member relationship exists', async () => {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: 'local-workspace',
          userId: 'local-user',
        },
      },
    })

    expect(member).not.toBeNull()
    expect(member?.role).toBe('owner')
  })
})

// Provide helpful message when tests are skipped
describe.skipIf(shouldRunDbTests)('Database Smoke Test (SKIPPED)', () => {
  it('skipped - set RUN_DB_TESTS=1 to run database tests', () => {
    console.log('\n📋 Database tests skipped. To run them:')
    console.log('   RUN_DB_TESTS=1 npm test -- db-smoke\n')
    expect(true).toBe(true)
  })
})
